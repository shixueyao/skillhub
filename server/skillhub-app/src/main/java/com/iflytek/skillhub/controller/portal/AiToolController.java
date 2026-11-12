package com.iflytek.skillhub.controller.portal;

import com.iflytek.skillhub.auth.rbac.PlatformPrincipal;
import com.iflytek.skillhub.controller.BaseApiController;
import com.iflytek.skillhub.dto.AiToolCategoryResponse;
import com.iflytek.skillhub.dto.AiToolDetailResponse;
import com.iflytek.skillhub.dto.AiToolPublishResponse;
import com.iflytek.skillhub.dto.AiToolSummaryResponse;
import com.iflytek.skillhub.dto.AiToolUpdateRequest;
import com.iflytek.skillhub.dto.ApiResponse;
import com.iflytek.skillhub.dto.ApiResponseFactory;
import com.iflytek.skillhub.dto.PageResponse;
import com.iflytek.skillhub.ratelimit.RateLimit;
import com.iflytek.skillhub.service.AiToolAppService;
import com.iflytek.skillhub.service.AuditRequestContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
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

import java.util.List;
import java.util.Set;

/**
 * Downloadable AI tools. Reads and downloads are public; publishing, metadata
 * edits and deletion are restricted to platform super administrators.
 */
@RestController
@Tag(name = "AI Tools")
@RequestMapping({"/api/v1/ai-tools", "/api/web/ai-tools"})
public class AiToolController extends BaseApiController {

    private final AiToolAppService appService;

    public AiToolController(AiToolAppService appService, ApiResponseFactory responseFactory) {
        super(responseFactory);
        this.appService = appService;
    }

    @GetMapping
    @Operation(operationId = "listAiTools", summary = "Browse downloadable AI tools")
    public ApiResponse<PageResponse<AiToolSummaryResponse>> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return ok("response.success.read", appService.search(q, category, sort, page, size));
    }

    @GetMapping("/categories")
    @Operation(operationId = "listAiToolCategories", summary = "List AI tool categories with counts")
    public ApiResponse<List<AiToolCategoryResponse>> categories() {
        return ok("response.success.read", appService.categories());
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getAiTool", summary = "Get one AI tool with usage instructions")
    public ApiResponse<AiToolDetailResponse> detail(@PathVariable Long id) {
        return ok("response.success.read", appService.detail(id));
    }

    @GetMapping("/{id}/download")
    @Operation(operationId = "downloadAiTool", summary = "Download an AI tool file")
    @RateLimit(category = "download", authenticated = 120, anonymous = 60)
    public ResponseEntity<InputStreamResource> download(@PathVariable Long id) {
        AiToolAppService.DownloadResult result = appService.download(id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + result.filename().replace("\"", "_") + "\"")
                .header("X-Checksum-Sha256", result.sha256())
                .contentType(mediaType(result.contentType()))
                .contentLength(result.contentLength())
                .body(new InputStreamResource(result.content()));
    }

    @PostMapping(consumes = "multipart/form-data")
    @Operation(operationId = "publishAiTool", summary = "Upload and publish an AI tool")
    @RateLimit(category = "publish", authenticated = 20, anonymous = 0)
    public ApiResponse<AiToolPublishResponse> publish(
            @RequestParam("file") MultipartFile file,
            @RequestParam String name,
            @RequestParam(required = false) String version,
            @RequestParam(required = false) String summary,
            @RequestParam(required = false) String usageInstructions,
            @RequestParam(required = false) String category,
            @RequestAttribute("userId") String userId,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.published", appService.publish(
                file,
                new AiToolAppService.PublishForm(name, version, summary, usageInstructions, category),
                userId,
                platformRoles(principal),
                AuditRequestContext.from(request)));
    }

    @PutMapping("/{id}")
    @Operation(operationId = "updateAiTool", summary = "Update AI tool metadata")
    public ApiResponse<AiToolDetailResponse> update(
            @PathVariable Long id,
            @RequestBody AiToolUpdateRequest body,
            @RequestAttribute("userId") String userId,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.updated", appService.updateMetadata(
                id, body, userId, platformRoles(principal), AuditRequestContext.from(request)));
    }

    @DeleteMapping("/{id}")
    @Operation(operationId = "deleteAiTool", summary = "Delete an AI tool and its file")
    public ApiResponse<Void> delete(
            @PathVariable Long id,
            @RequestAttribute("userId") String userId,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        appService.delete(id, userId, platformRoles(principal), AuditRequestContext.from(request));
        return ok("response.success.deleted", null);
    }

    private Set<String> platformRoles(PlatformPrincipal principal) {
        return principal == null || principal.platformRoles() == null
                ? Set.of()
                : principal.platformRoles();
    }

    private MediaType mediaType(String value) {
        try {
            return MediaType.parseMediaType(value);
        } catch (RuntimeException exception) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
