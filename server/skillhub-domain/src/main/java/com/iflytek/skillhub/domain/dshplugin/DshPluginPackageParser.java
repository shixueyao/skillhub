package com.iflytek.skillhub.domain.dshplugin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;

import java.io.BufferedInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

/**
 * Reads the identity and compatibility metadata of an npm-style {@code .tgz}
 * without extracting any file to disk.
 *
 * <p>The parser is intentionally strict: the registry only needs the tarball's
 * root {@code package/package.json}, and a package containing absolute paths,
 * parent traversal, or link entries is rejected instead of being stored for a
 * later extractor to interpret. Size and entry counts are bounded so a hostile
 * archive cannot exhaust memory or CPU during preview.
 */
public final class DshPluginPackageParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final Pattern PACKAGE_NAME = Pattern.compile(
            "^(@[a-z0-9][a-z0-9._~-]*/)?[a-z0-9][a-z0-9._~-]*$");
    private static final Pattern SEMVER = Pattern.compile(
            "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)"
                    + "(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?"
                    + "(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$");
    private static final int MAX_PACKAGE_NAME = 214;
    private static final int MAX_MANIFEST_FIELD = 20_000;

    private DshPluginPackageParser() {
    }

    /**
     * Bounds applied to one upload.
     *
     * @param maxCompressedBytes  maximum on-disk tarball size
     * @param maxUncompressedBytes maximum sum of tar entry sizes
     * @param maxPackageJsonBytes maximum size of {@code package/package.json}
     * @param maxEntries          maximum number of tar entries
     */
    public record Limits(
            long maxCompressedBytes,
            long maxUncompressedBytes,
            long maxPackageJsonBytes,
            int maxEntries
    ) {
        public static Limits defaults() {
            return new Limits(50L * 1024 * 1024, 256L * 1024 * 1024, 2L * 1024 * 1024, 10_000);
        }
    }

    public static DshPluginPackage parse(Path tarball, Limits limits) {
        long size;
        try {
            size = Files.size(tarball);
        } catch (IOException exception) {
            throw new DomainBadRequestException("error.dsh.plugin.package.invalid");
        }
        if (size <= 0 || size > limits.maxCompressedBytes()) {
            throw new DomainBadRequestException(
                    "error.dsh.plugin.package.tooLarge", limits.maxCompressedBytes());
        }

        byte[] packageJson = readPackageJson(tarball, limits);
        return parseManifest(packageJson);
    }

    private static byte[] readPackageJson(Path tarball, Limits limits) {
        byte[] header = new byte[512];
        byte[] packageJson = null;
        long uncompressed = 0;
        int entries = 0;
        try (InputStream input = new GZIPInputStream(
                new BufferedInputStream(Files.newInputStream(tarball), 64 * 1024))) {
            while (true) {
                int read = readFully(input, header, 0, header.length);
                if (read == 0) {
                    break;
                }
                if (read < header.length) {
                    throw new DomainBadRequestException("error.dsh.plugin.package.invalid");
                }
                if (isAllZero(header)) {
                    break;
                }
                verifyChecksum(header);

                String name = readName(header);
                char type = (char) (header[156] & 0xff);
                long entrySize = parseOctal(header, 124, 12);
                if (entrySize < 0) {
                    throw new DomainBadRequestException("error.dsh.plugin.package.invalid");
                }

                if (++entries > limits.maxEntries()) {
                    throw new DomainBadRequestException(
                            "error.dsh.plugin.package.tooManyEntries", limits.maxEntries());
                }
                if (entrySize > limits.maxUncompressedBytes() - uncompressed) {
                    throw new DomainBadRequestException(
                            "error.dsh.plugin.package.tooLarge", limits.maxUncompressedBytes());
                }
                uncompressed += entrySize;

                assertSafeEntry(name, type);

                if ("package/package.json".equals(name)) {
                    if (entrySize > limits.maxPackageJsonBytes()) {
                        throw new DomainBadRequestException(
                                "error.dsh.plugin.package.manifestTooLarge", limits.maxPackageJsonBytes());
                    }
                    byte[] content = new byte[(int) entrySize];
                    if (readFully(input, content, 0, content.length) < content.length) {
                        throw new DomainBadRequestException("error.dsh.plugin.package.invalid");
                    }
                    skipPadding(input, entrySize);
                    packageJson = content;
                    continue;
                }

                skipFully(input, entrySize);
                skipPadding(input, entrySize);
            }
        } catch (DomainBadRequestException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new DomainBadRequestException("error.dsh.plugin.package.notGzip");
        }
        if (packageJson == null) {
            throw new DomainBadRequestException("error.dsh.plugin.package.manifestMissing");
        }
        return packageJson;
    }

    private static DshPluginPackage parseManifest(byte[] packageJson) {
        JsonNode root;
        try {
            root = MAPPER.readTree(packageJson);
        } catch (IOException exception) {
            throw new DomainBadRequestException("error.dsh.plugin.package.manifestInvalid");
        }
        if (root == null || !root.isObject()) {
            throw new DomainBadRequestException("error.dsh.plugin.package.manifestInvalid");
        }

        String packageName = text(root, "name");
        if (packageName == null
                || packageName.length() > MAX_PACKAGE_NAME
                || !PACKAGE_NAME.matcher(packageName).matches()) {
            throw new DomainBadRequestException("error.dsh.plugin.package.nameInvalid");
        }

        String version = text(root, "version");
        if (version == null || version.length() > 64 || !SEMVER.matcher(version).matches()) {
            throw new DomainBadRequestException("error.dsh.plugin.package.versionInvalid");
        }

        String description = truncate(text(root, "description"), MAX_MANIFEST_FIELD);
        String license = truncate(text(root, "license"), 64);
        String homepage = truncate(text(root, "homepage"), 512);
        if (homepage == null) {
            JsonNode repository = root.get("repository");
            if (repository != null && repository.isObject()) {
                homepage = truncate(text(repository, "url"), 512);
            }
        }

        Map<String, String> engines = stringMap(root.get("engines"));
        Map<String, String> peerDependencies = stringMap(root.get("peerDependencies"));
        List<String> capabilities = capabilities(root.get("dsh"));

        try {
            ObjectNode manifest = MAPPER.createObjectNode();
            manifest.put("name", packageName);
            manifest.put("version", version);
            if (description != null) {
                manifest.put("description", description);
            }
            if (license != null) {
                manifest.put("license", license);
            }
            if (homepage != null) {
                manifest.put("homepage", homepage);
            }
            manifest.set("engines", MAPPER.valueToTree(engines));
            manifest.set("peerDependencies", MAPPER.valueToTree(peerDependencies));
            manifest.set("capabilities", MAPPER.valueToTree(capabilities));

            String summary = truncate(description, 2000);
            return new DshPluginPackage(
                    packageName,
                    version,
                    summary,
                    license,
                    homepage,
                    engines,
                    peerDependencies,
                    capabilities,
                    MAPPER.writeValueAsString(manifest));
        } catch (IOException exception) {
            throw new DomainBadRequestException("error.dsh.plugin.package.manifestInvalid");
        }
    }

    private static void assertSafeEntry(String name, char type) {
        if (name == null || name.isEmpty() || name.indexOf('\0') >= 0 || name.indexOf('\\') >= 0) {
            throw new DomainBadRequestException("error.dsh.plugin.package.unsafeEntry", name);
        }
        if (name.startsWith("/")) {
            throw new DomainBadRequestException("error.dsh.plugin.package.unsafeEntry", name);
        }
        for (String segment : name.split("/", -1)) {
            if ("..".equals(segment)) {
                throw new DomainBadRequestException("error.dsh.plugin.package.unsafeEntry", name);
            }
        }
        if (type == '1' || type == '2') {
            throw new DomainBadRequestException("error.dsh.plugin.package.unsafeEntry", name);
        }
        // Regular files, directories, and PAX metadata are read or skipped. PAX paths
        // are not applied because the manifest path is fixed and short.
        if (type != '0' && type != '\0' && type != '5' && type != 'x' && type != 'g') {
            throw new DomainBadRequestException("error.dsh.plugin.package.unsafeEntry", name);
        }
    }

    private static String readName(byte[] header) {
        String name = readString(header, 0, 100);
        String prefix = readString(header, 345, 155);
        return prefix.isEmpty() ? name : prefix + "/" + name;
    }

    private static String readString(byte[] buffer, int offset, int length) {
        int end = offset;
        while (end < offset + length && buffer[end] != 0) {
            end++;
        }
        return new String(buffer, offset, end - offset, StandardCharsets.UTF_8).trim();
    }

    private static long parseOctal(byte[] header, int offset, int length) {
        long value = 0;
        boolean seen = false;
        for (int index = offset; index < offset + length; index++) {
            int current = header[index] & 0xff;
            if (current == 0 || current == ' ') {
                if (seen) {
                    break;
                }
                continue;
            }
            if (current < '0' || current > '7') {
                return -1;
            }
            seen = true;
            value = (value * 8) + (current - '0');
        }
        return seen ? value : 0;
    }

    private static void verifyChecksum(byte[] header) {
        long stored = parseOctal(header, 148, 8);
        long computed = 0;
        for (int index = 0; index < header.length; index++) {
            computed += (index >= 148 && index < 156) ? ' ' : (header[index] & 0xff);
        }
        if (stored != computed) {
            throw new DomainBadRequestException("error.dsh.plugin.package.invalid");
        }
    }

    private static boolean isAllZero(byte[] header) {
        for (byte value : header) {
            if (value != 0) {
                return false;
            }
        }
        return true;
    }

    private static void skipPadding(InputStream input, long size) throws IOException {
        long remainder = size % 512;
        if (remainder != 0) {
            skipFully(input, 512 - remainder);
        }
    }

    private static void skipFully(InputStream input, long bytes) throws IOException {
        long remaining = bytes;
        byte[] buffer = new byte[64 * 1024];
        while (remaining > 0) {
            int read = input.read(buffer, 0, (int) Math.min(buffer.length, remaining));
            if (read < 0) {
                throw new EOFException();
            }
            remaining -= read;
        }
    }

    private static int readFully(InputStream input, byte[] buffer, int offset, int length) throws IOException {
        int total = 0;
        while (total < length) {
            int read = input.read(buffer, offset + total, length - total);
            if (read < 0) {
                return total;
            }
            total += read;
        }
        return total;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual()) {
            return null;
        }
        String text = value.asText().trim();
        return text.isEmpty() ? null : text;
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static Map<String, String> stringMap(JsonNode node) {
        Map<String, String> values = new LinkedHashMap<>();
        if (node == null || !node.isObject()) {
            return values;
        }
        Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
        while (fields.hasNext() && values.size() < 200) {
            Map.Entry<String, JsonNode> field = fields.next();
            if (field.getValue().isTextual()) {
                values.put(field.getKey(), truncate(field.getValue().asText(), 256));
            }
        }
        return values;
    }

    private static List<String> capabilities(JsonNode node) {
        List<String> values = new ArrayList<>();
        if (node == null) {
            return values;
        }
        if (node.isArray()) {
            for (JsonNode item : node) {
                if (item.isTextual() && values.size() < 20) {
                    values.add(item.asText());
                }
            }
            return values;
        }
        if (node.isObject()) {
            Iterator<String> names = node.fieldNames();
            while (names.hasNext() && values.size() < 20) {
                values.add(names.next());
            }
        }
        return values;
    }
}
