package com.iflytek.skillhub.controller.portal;

import com.iflytek.skillhub.auth.rbac.PlatformPrincipal;
import com.iflytek.skillhub.controller.BaseApiController;
import com.iflytek.skillhub.dto.ApiResponse;
import com.iflytek.skillhub.dto.ApiResponseFactory;
import com.iflytek.skillhub.dto.McpCategoryResponse;
import com.iflytek.skillhub.dto.McpServerDetailResponse;
import com.iflytek.skillhub.dto.McpServerPublishResponse;
import com.iflytek.skillhub.dto.McpServerSaveRequest;
import com.iflytek.skillhub.dto.McpServerSummaryResponse;
import com.iflytek.skillhub.dto.PageResponse;
import com.iflytek.skillhub.ratelimit.RateLimit;
import com.iflytek.skillhub.service.AuditRequestContext;
import com.iflytek.skillhub.service.McpServerAppService;
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
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Set;

/**
 * MCP server registry. Reads are public; any signed-in user can publish, and
 * owners (or super administrators) can update/delete their own entries.
 */
@RestController
@Tag(name = "MCP Servers")
@RequestMapping({"/api/v1/mcp-servers", "/api/web/mcp-servers"})
public class McpServerController extends BaseApiController {

    private final McpServerAppService appService;

    public McpServerController(McpServerAppService appService, ApiResponseFactory responseFactory) {
        super(responseFactory);
        this.appService = appService;
    }

    @GetMapping
    @Operation(operationId = "listMcpServers", summary = "Browse MCP server definitions")
    public ApiResponse<PageResponse<McpServerSummaryResponse>> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String transport,
            @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return ok("response.success.read", appService.search(q, category, transport, sort, page, size));
    }

    @GetMapping("/categories")
    @Operation(operationId = "listMcpCategories", summary = "List MCP categories with counts")
    public ApiResponse<List<McpCategoryResponse>> categories() {
        return ok("response.success.read", appService.categories());
    }

    @GetMapping("/mine")
    @Operation(operationId = "listMyMcpServers", summary = "List MCP servers published by the current user")
    public ApiResponse<PageResponse<McpServerSummaryResponse>> mine(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "24") int size,
            @RequestAttribute("userId") String userId) {
        return ok("response.success.read", appService.searchMine(userId, page, size));
    }

    @GetMapping("/{slug}")
    @Operation(operationId = "getMcpServer", summary = "Get one MCP server and client configuration")
    public ApiResponse<McpServerDetailResponse> detail(@PathVariable String slug) {
        return ok("response.success.read", appService.detail(slug));
    }

    @GetMapping("/{slug}/attachment")
    @Operation(operationId = "downloadMcpAttachment", summary = "Download an MCP server attachment")
    public ResponseEntity<InputStreamResource> attachment(@PathVariable String slug) {
        McpServerAppService.AttachmentResult result = appService.downloadAttachment(slug);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + result.filename().replace("\"", "_") + "\"")
                .header("X-Checksum-Sha256", result.sha256())
                .contentType(mediaType(result.contentType()))
                .contentLength(result.contentLength())
                .body(new InputStreamResource(result.content()));
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "publishMcpServer", summary = "Publish an MCP server definition")
    @RateLimit(category = "publish", authenticated = 20, anonymous = 0)
    public ApiResponse<McpServerPublishResponse> publish(
            @RequestBody McpServerSaveRequest body,
            @RequestAttribute("userId") String userId,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.published", appService.publish(
                body, null, userId, displayName(principal), AuditRequestContext.from(request)));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(operationId = "publishMcpServerWithAttachment", summary = "Publish an MCP server with an attachment")
    @RateLimit(category = "publish", authenticated = 20, anonymous = 0)
    public ApiResponse<McpServerPublishResponse> publishMultipart(
            @RequestPart("metadata") McpServerSaveRequest body,
            @RequestPart(value = "file", required = false) MultipartFile file,
            @RequestAttribute("userId") String userId,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.published", appService.publish(
                body, file, userId, displayName(principal), AuditRequestContext.from(request)));
    }

    @PutMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "updateMcpServer", summary = "Update an owned MCP server definition")
    public ApiResponse<McpServerDetailResponse> update(
            @PathVariable Long id,
            @RequestBody McpServerSaveRequest body,
            @RequestAttribute("userId") String userId,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.updated", appService.update(
                id, body, null, userId, roles(principal), AuditRequestContext.from(request)));
    }

    @PutMapping(path = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(operationId = "updateMcpServerWithAttachment", summary = "Update an MCP server and optional attachment")
    public ApiResponse<McpServerDetailResponse> updateMultipart(
            @PathVariable Long id,
            @RequestPart("metadata") McpServerSaveRequest body,
            @RequestPart(value = "file", required = false) MultipartFile file,
            @RequestAttribute("userId") String userId,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        return ok("response.success.updated", appService.update(
                id, body, file, userId, roles(principal), AuditRequestContext.from(request)));
    }

    @DeleteMapping("/{id}")
    @Operation(operationId = "deleteMcpServer", summary = "Delete an owned MCP server definition")
    public ApiResponse<Void> delete(
            @PathVariable Long id,
            @RequestAttribute("userId") String userId,
            @AuthenticationPrincipal PlatformPrincipal principal,
            HttpServletRequest request) {
        appService.delete(id, userId, roles(principal), AuditRequestContext.from(request));
        return ok("response.success.deleted", null);
    }

    private String displayName(PlatformPrincipal principal) {
        if (principal == null) return null;
        return principal.displayName() == null || principal.displayName().isBlank()
                ? principal.userId()
                : principal.displayName();
    }

    private Set<String> roles(PlatformPrincipal principal) {
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
