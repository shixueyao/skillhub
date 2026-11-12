package com.iflytek.skillhub.controller;

import com.iflytek.skillhub.auth.rbac.PlatformPrincipal;
import com.iflytek.skillhub.domain.namespace.NamespaceMemberRepository;
import com.iflytek.skillhub.dto.DshPluginDetailResponse;
import com.iflytek.skillhub.dto.DshPluginPublishResponse;
import com.iflytek.skillhub.dto.DshPluginSummaryResponse;
import com.iflytek.skillhub.dto.PageResponse;
import com.iflytek.skillhub.service.DshPluginAppService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DshPluginControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DshPluginAppService appService;

    @MockBean
    private NamespaceMemberRepository namespaceMemberRepository;

    @Test
    void publicCatalogAndDetailAreAnonymous() throws Exception {
        given(appService.search(null, null, null, "newest", 0, 12))
                .willReturn(new PageResponse<>(List.of(summary()), 1, 0, 12));
        given(appService.detail(eq("team"), eq("hello-dsh"), isNull(), any(), eq(Set.of())))
                .willReturn(detail());

        mockMvc.perform(get("/api/web/dsh-plugins"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.items[0].packageName").value("@acme/hello-dsh"))
                .andExpect(jsonPath("$.data.items[0].latestVersion").value("1.2.3"));

        mockMvc.perform(get("/api/v1/dsh-plugins/team/hello-dsh"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slug").value("hello-dsh"))
                .andExpect(jsonPath("$.data.versions[0].sha256").value("a".repeat(64)));
    }

    @Test
    void publishRequiresAuthenticationAndCsrf() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "plugin.tgz", "application/gzip", new byte[]{1, 2, 3});

        mockMvc.perform(multipart("/api/web/dsh-plugins/team/publish")
                        .file(file)
                        .param("tags", "official, dsh")
                        .with(csrf()))
                .andExpect(status().isUnauthorized());

        given(appService.publish(eq("team"), any(), any(), eq("user-1"), any(), eq(Set.of()), any()))
                .willReturn(new DshPluginPublishResponse(
                        7L, "team", "hello-dsh", "@acme/hello-dsh", "1.2.3", "PUBLISHED", true));

        mockMvc.perform(multipart("/api/web/dsh-plugins/team/publish")
                        .file(file)
                        .param("tags", "official, dsh")
                        .with(authentication(authenticationToken()))
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.pluginId").value(7))
                .andExpect(jsonPath("$.data.version").value("1.2.3"));
    }

    private UsernamePasswordAuthenticationToken authenticationToken() {
        PlatformPrincipal principal = new PlatformPrincipal(
                "user-1", "Tester", null, "", "local", Set.of());
        return new UsernamePasswordAuthenticationToken(principal, null, List.of());
    }

    private DshPluginSummaryResponse summary() {
        return new DshPluginSummaryResponse(
                7L, "team", "Team", "hello-dsh", "@acme/hello-dsh", "Hello", "Hello plugin",
                "Official", List.of("official"), "1.2.3", Instant.parse("2026-01-01T00:00:00Z"),
                1, 5, false, "user-1", "Tester",
                Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2026-01-01T00:00:00Z"));
    }

    private DshPluginDetailResponse detail() {
        return new DshPluginDetailResponse(
                7L, 1L, "team", "Team", "hello-dsh", "@acme/hello-dsh", "Hello", "Hello plugin",
                "Long description", "https://example.com", "Apache-2.0", "Official", List.of("official"),
                "ACTIVE", false, 3L, "1.2.3", 5, "user-1", "Tester",
                Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2026-01-01T00:00:00Z"),
                Set.of(),
                List.of(new com.iflytek.skillhub.dto.DshPluginVersionResponse(
                        3L, "1.2.3", "PUBLISHED", "a".repeat(64), 1024,
                        List.of("bundle"), Map.of("node", ">=24"), Map.of(), null, null,
                        5, Instant.parse("2026-01-01T00:00:00Z"), "user-1", null, null, null, true)));
    }
}
