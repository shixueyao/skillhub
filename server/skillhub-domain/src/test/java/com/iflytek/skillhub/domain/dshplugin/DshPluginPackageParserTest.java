package com.iflytek.skillhub.domain.dshplugin;

import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.GZIPOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DshPluginPackageParserTest {

    @TempDir
    Path tempDirectory;

    @Test
    void readsIdentityAndDshCapabilitiesFromNpmTarball() throws IOException {
        String manifest = """
                {
                  "name": "@acme/hello-dsh",
                  "version": "1.2.3",
                  "description": "Hello plugin",
                  "license": "Apache-2.0",
                  "homepage": "https://example.com/hello",
                  "engines": {"node": ">=24.2.0 <25"},
                  "peerDependencies": {"@deepseek-ai/cordis": "4.0.5"},
                  "dsh": {"bundle": {"patch": "./cordis.patch.yml"}, "client": {"platform": "web"}}
                }
                """;
        Path tarball = writeTarball(
                entry("package/package.json", manifest),
                entry("package/lib/index.js", "export default 1;\n"));

        DshPluginPackage parsed = DshPluginPackageParser.parse(
                tarball, DshPluginPackageParser.Limits.defaults());

        assertThat(parsed.packageName()).isEqualTo("@acme/hello-dsh");
        assertThat(parsed.version()).isEqualTo("1.2.3");
        assertThat(parsed.license()).isEqualTo("Apache-2.0");
        assertThat(parsed.homepage()).isEqualTo("https://example.com/hello");
        assertThat(parsed.capabilities()).containsExactly("bundle", "client");
        assertThat(parsed.engines()).containsEntry("node", ">=24.2.0 <25");
        assertThat(parsed.peerDependencies()).containsEntry("@deepseek-ai/cordis", "4.0.5");
        assertThat(parsed.manifestJson()).contains("\"capabilities\":[\"bundle\",\"client\"]");
        assertThat(parsed.manifestJson()).doesNotContain("scripts");
    }

    @Test
    void rejectsTarballWithoutPackageJson() throws IOException {
        Path tarball = writeTarball(entry("package/lib/index.js", "export default 1;\n"));

        assertThatThrownBy(() -> DshPluginPackageParser.parse(
                tarball, DshPluginPackageParser.Limits.defaults()))
                .isInstanceOfSatisfying(DomainBadRequestException.class, exception ->
                        assertThat(exception.messageCode())
                                .isEqualTo("error.dsh.plugin.package.manifestMissing"));
    }

    @Test
    void rejectsParentTraversalEntries() throws IOException {
        Path tarball = writeTarball(
                entry("package/package.json", "{\"name\":\"ok\",\"version\":\"1.0.0\"}"),
                entry("../escape.sh", "echo no"));

        assertThatThrownBy(() -> DshPluginPackageParser.parse(
                tarball, DshPluginPackageParser.Limits.defaults()))
                .isInstanceOfSatisfying(DomainBadRequestException.class, exception ->
                        assertThat(exception.messageCode())
                                .isEqualTo("error.dsh.plugin.package.unsafeEntry"));
    }

    @Test
    void rejectsNonSemanticVersion() throws IOException {
        Path tarball = writeTarball(
                entry("package/package.json", "{\"name\":\"ok\",\"version\":\"latest\"}"));

        assertThatThrownBy(() -> DshPluginPackageParser.parse(
                tarball, DshPluginPackageParser.Limits.defaults()))
                .isInstanceOfSatisfying(DomainBadRequestException.class, exception ->
                        assertThat(exception.messageCode())
                                .isEqualTo("error.dsh.plugin.package.versionInvalid"));
    }

    @Test
    void rejectsUppercasePackageName() throws IOException {
        Path tarball = writeTarball(
                entry("package/package.json", "{\"name\":\"Hello\",\"version\":\"1.0.0\"}"));

        assertThatThrownBy(() -> DshPluginPackageParser.parse(
                tarball, DshPluginPackageParser.Limits.defaults()))
                .isInstanceOfSatisfying(DomainBadRequestException.class, exception ->
                        assertThat(exception.messageCode())
                                .isEqualTo("error.dsh.plugin.package.nameInvalid"));
    }

    @Test
    void rejectsPackageLargerThanCompressedLimit() throws IOException {
        Path tarball = writeTarball(entry("package/package.json",
                "{\"name\":\"ok\",\"version\":\"1.0.0\"}"));

        assertThatThrownBy(() -> DshPluginPackageParser.parse(
                tarball, new DshPluginPackageParser.Limits(16, 1024, 1024, 10)))
                .isInstanceOfSatisfying(DomainBadRequestException.class, exception ->
                        assertThat(exception.messageCode())
                                .isEqualTo("error.dsh.plugin.package.tooLarge"));
    }

    private Path writeTarball(TarEntry... entries) throws IOException {
        ByteArrayOutputStream tar = new ByteArrayOutputStream();
        for (TarEntry entry : entries) {
            byte[] content = entry.content().getBytes(StandardCharsets.UTF_8);
            tar.write(header(entry.name(), content.length));
            tar.write(content);
            int padding = (512 - (content.length % 512)) % 512;
            tar.write(new byte[padding]);
        }
        tar.write(new byte[1024]);
        Path file = Files.createTempFile(tempDirectory, "plugin-", ".tgz");
        try (GZIPOutputStream gzip = new GZIPOutputStream(Files.newOutputStream(file))) {
            gzip.write(tar.toByteArray());
        }
        return file;
    }

    private static TarEntry entry(String name, String content) {
        return new TarEntry(name, content);
    }

    private static byte[] header(String name, int size) {
        byte[] header = new byte[512];
        putString(header, 0, name);
        putOctal(header, 100, 8, 0644);
        putOctal(header, 108, 8, 0);
        putOctal(header, 116, 8, 0);
        putOctal(header, 124, 12, size);
        putOctal(header, 136, 12, 0);
        header[156] = '0';
        putString(header, 257, "ustar");
        header[263] = '0';
        header[264] = '0';
        for (int index = 148; index < 156; index++) {
            header[index] = ' ';
        }
        int checksum = 0;
        for (byte value : header) {
            checksum += value & 0xff;
        }
        byte[] encodedChecksum = String.format("%06o", checksum).getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(encodedChecksum, 0, header, 148, 6);
        header[154] = 0;
        header[155] = ' ';
        return header;
    }

    private static void putString(byte[] target, int offset, String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        System.arraycopy(bytes, 0, target, offset, Math.min(bytes.length, 100));
    }

    private static void putOctal(byte[] target, int offset, int length, long value) {
        String encoded = String.format("%0" + (length - 1) + "o", value);
        byte[] bytes = encoded.getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(bytes, 0, target, offset, Math.min(bytes.length, length - 1));
        target[offset + length - 1] = 0;
    }

    private record TarEntry(String name, String content) {
    }
}
