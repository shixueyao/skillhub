package com.iflytek.skillhub.controller.portal;

import com.iflytek.skillhub.auth.rbac.PlatformPrincipal;
import com.iflytek.skillhub.controller.BaseApiController;
import com.iflytek.skillhub.domain.namespace.NamespaceRole;
import com.iflytek.skillhub.dto.ApiResponse;
import com.iflytek.skillhub.dto.ApiResponseFactory;
import com.iflytek.skillhub.dto.DshPluginCategoryResponse;
import com.iflytek.skillhub.dto.DshPluginDetailResponse;
import com.iflytek.skillhub.dto.DshPluginPackagePreviewResponse;
import com.iflytek.skillhub.dto.DshPluginPublishResponse;
import com.iflytek.skillhub.dto.DshPluginSummaryResponse;
import com.iflytek.skillhub.dto.DshPluginUpdateRequest;
import com.iflytek.skillhub.dto.DshPluginVersionResponse;
import com.iflytek.skillhub.dto.DshPluginYankRequest;
import com.iflytek.skillhub.dto.PageResponse;
import com.iflytek.skillhub.ratelimit.RateLimit;
import com.iflytek.skillhub.service.AuditRequestContext;
import com.iflytek.skillhub.service.DshPluginAppService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Transport endpoints for hosted DSH plugin discovery, publication and lifecycle.
 *
 * <p>Reads are anonymous and version downloads are served from object storage.
 * Writes require an authenticated session and are authorized in the application
 * service by namespace role, plugin ownership, or platform role.
 */
@RestController
@Tag(name = "DSH Plugins")
@RequestMapping({"/api/v1/dsh-plugins", "/api/web/dsh-plugins"})
public class DshPluginController extends BaseApiController {

    private final DshPluginAppService appService;

    public DshPluginController(DshPluginAppService appService, ApiResponseFactory responseFactory) {
        super(responseFactory);
        this.appService = appService;
    }

    @GetMapping
    @Operation(operationId = "listDshPlugins", summary = "Browse hosted DSH plugins")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Plugin page returned")
    public ApiResponse<PageResponse<DshPluginSummaryResponse>> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String tag,
            @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return ok("response.success.read", appService.search(q, category, tag, sort, page, size));
    }

    @GetMapping("/categories")
    @Operation(operationId = "listDshPluginCategories", summary = "List plugin categories with counts")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Categories returned")
    public ApiResponse<List<DshPluginCategoryResponse>> categories() {
        return ok("response.success.read", appService.categories());
    }

    @GetMapping("/mine")
    @Operation(operationId = "listMyDshPlugins", summary = "List plugins created or administered by the caller")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Owned plugin page returned")
    public ApiResponse<PageResponse<DshPluginSummaryResponse>> mine(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestAttribute("userId") String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles) {
        return ok("response.success.read", appService.mine(userId, q, page, size, roles));
    }

    @GetMapping("/{namespace}/{slug}")
    @Operation(operationId = "getDshPlugin", summary = "Get one plugin with its version ledger")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Plugin returned")
    public ApiResponse<DshPluginDetailResponse> detail(
            @PathVariable String namespace,
            @PathVariable String slug,
            @RequestAttribute(value = "userId", required = false) String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal) {
        return ok("response.success.read", appService.detail(
                trimNamespace(namespace), slug, userId, roles, platformRoles(principal)));
    }

    @GetMapping("/{namespace}/{slug}/versions")
    @Operation(operationId = "listDshPluginVersions", summary = "List a plugin's versions")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Version ledger returned")
    public ApiResponse<List<DshPluginVersionResponse>> versions(
            @PathVariable String namespace,
            @PathVariable String slug,
            @RequestAttribute(value = "userId", required = false) String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal) {
        return ok("response.success.read", appService.detail(
                trimNamespace(namespace), slug, userId, roles, platformRoles(principal)).versions());
    }

    @GetMapping("/{namespace}/{slug}/download")
    @Operation(operationId = "downloadDshPlugin", summary = "Download the recommended plugin tarball")
    @RateLimit(category = "download", authenticated = 120, anonymous = 30)
    public ResponseEntity<InputStreamResource> download(
            @PathVariable String namespace,
            @PathVariable String slug,
            @RequestAttribute(value = "userId", required = false) String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal) {
        return downloadResponse(appService.download(
                trimNamespace(namespace), slug, null, userId, roles, platformRoles(principal)));
    }

    @GetMapping("/{namespace}/{slug}/versions/{version}/download")
    @Operation(operationId = "downloadDshPluginVersion", summary = "Download one exact plugin tarball")
    @RateLimit(category = "download", authenticated = 120, anonymous = 30)
    public ResponseEntity<InputStreamResource> downloadVersion(
            @PathVariable String namespace,
            @PathVariable String slug,
            @PathVariable String version,
            @RequestAttribute(value = "userId", required = false) String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal) {
        return downloadResponse(appService.download(
                trimNamespace(namespace), slug, version, userId, roles, platformRoles(principal)));
    }

    @PostMapping(value = "/package-preview", consumes = "multipart/form-data")
    @Operation(operationId = "previewDshPluginPackage", summary = "Read a plugin tarball without publishing it")
    @RateLimit(category = "publish", authenticated = 20, anonymous = 0)
    public ApiResponse<DshPluginPackagePreviewResponse> preview(
            @RequestParam("file") MultipartFile file,
            @RequestParam("namespace") String namespace,
            @RequestAttribute("userId") String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal) {
        return ok("response.success.read", appService.preview(
                trimNamespace(namespace), file, userId, roles, platformRoles(principal)));
    }

    @PostMapping(value = "/{namespace}/publish", consumes = "multipart/form-data")
    @Operation(operationId = "publishDshPlugin", summary = "Publish a plugin version into a namespace")
    @RateLimit(category = "publish", authenticated = 10, anonymous = 0)
    public ApiResponse<DshPluginPublishResponse> publish(
            @PathVariable String namespace,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String displayName,
            @RequestParam(required = false) String summary,
            @RequestParam(required = false) String description,
            @RequestParam(required = false) String homepage,
            @RequestParam(required = false) String license,
            @RequestParam(required = false) String category,
            @RequestParam(value = "tags", required = false) String tags,
            @RequestParam(required = false) String compatNote,
            @RequestParam(required = false) String releaseNotes,
            @RequestAttribute("userId") String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        DshPluginAppService.PublishForm form = new DshPluginAppService.PublishForm(
                displayName, summary, description, homepage, license, category,
                splitTags(tags), compatNote, releaseNotes);
        return ok("response.success.published", appService.publish(
                trimNamespace(namespace), file, form, userId, roles, platformRoles(principal),
                AuditRequestContext.from(request)));
    }

    @PutMapping("/{pluginId}")
    @Operation(operationId = "updateDshPlugin", summary = "Update plugin metadata")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Plugin updated")
    public ApiResponse<DshPluginDetailResponse> update(
            @PathVariable Long pluginId,
            @Valid @RequestBody DshPluginUpdateRequest body,
            @RequestAttribute("userId") String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.updated", appService.updateMetadata(
                pluginId, body, userId, roles, platformRoles(principal), AuditRequestContext.from(request)));
    }

    @PostMapping("/{pluginId}/versions/{versionId}/yank")
    @Operation(operationId = "yankDshPluginVersion", summary = "Withdraw a plugin version from distribution")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Version yanked")
    public ApiResponse<DshPluginDetailResponse> yank(
            @PathVariable Long pluginId,
            @PathVariable Long versionId,
            @Valid @RequestBody(required = false) DshPluginYankRequest body,
            @RequestAttribute("userId") String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.updated", appService.yankVersion(
                pluginId, versionId, body == null ? null : body.reason(), userId, roles,
                platformRoles(principal), AuditRequestContext.from(request)));
    }

    @PostMapping("/{pluginId}/versions/{versionId}/unyank")
    @Operation(operationId = "unyankDshPluginVersion", summary = "Restore a yanked plugin version")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Version restored")
    public ApiResponse<DshPluginDetailResponse> unyank(
            @PathVariable Long pluginId,
            @PathVariable Long versionId,
            @RequestAttribute("userId") String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.updated", appService.unyankVersion(
                pluginId, versionId, userId, roles, platformRoles(principal),
                AuditRequestContext.from(request)));
    }

    @PostMapping("/{pluginId}/versions/{versionId}/recommend")
    @Operation(operationId = "recommendDshPluginVersion", summary = "Set the recommended plugin version")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Recommended version changed")
    public ApiResponse<DshPluginDetailResponse> recommend(
            @PathVariable Long pluginId,
            @PathVariable Long versionId,
            @RequestAttribute("userId") String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.updated", appService.recommendVersion(
                pluginId, versionId, userId, roles, platformRoles(principal),
                AuditRequestContext.from(request)));
    }

    @DeleteMapping("/{pluginId}/versions/{versionId}")
    @Operation(operationId = "deleteDshPluginVersion", summary = "Delete a plugin version and its tarball")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Version deleted")
    public ApiResponse<DshPluginDetailResponse> deleteVersion(
            @PathVariable Long pluginId,
            @PathVariable Long versionId,
            @RequestAttribute("userId") String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.updated", appService.deleteVersion(
                pluginId, versionId, userId, roles, platformRoles(principal),
                AuditRequestContext.from(request)));
    }

    @PostMapping("/{pluginId}/hide")
    @Operation(operationId = "hideDshPlugin", summary = "Hide a plugin from discovery")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Plugin hidden")
    public ApiResponse<DshPluginDetailResponse> hide(
            @PathVariable Long pluginId,
            @RequestAttribute("userId") String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.updated", appService.setHidden(
                pluginId, true, userId, roles, platformRoles(principal), AuditRequestContext.from(request)));
    }

    @PostMapping("/{pluginId}/restore")
    @Operation(operationId = "restoreDshPlugin", summary = "Restore a hidden plugin to discovery")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Plugin restored")
    public ApiResponse<DshPluginDetailResponse> restore(
            @PathVariable Long pluginId,
            @RequestAttribute("userId") String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.updated", appService.setHidden(
                pluginId, false, userId, roles, platformRoles(principal), AuditRequestContext.from(request)));
    }

    private ResponseEntity<InputStreamResource> downloadResponse(DshPluginAppService.DownloadResult result) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + result.filename() + "\"")
                .header("X-Checksum-Sha256", result.sha256())
                .contentType(MediaType.parseMediaType(result.contentType()))
                .contentLength(result.contentLength())
                .body(new InputStreamResource(result.content()));
    }

    private List<String> splitTags(String tags) {
        if (tags == null || tags.isBlank()) {
            return List.of();
        }
        return Arrays.stream(tags.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .toList();
    }

    private String trimNamespace(String namespace) {
        return namespace != null && namespace.startsWith("@") ? namespace.substring(1) : namespace;
    }

    private Set<String> platformRoles(PlatformPrincipal principal) {
        return principal == null || principal.platformRoles() == null
                ? Set.of()
                : principal.platformRoles();
    }
}
