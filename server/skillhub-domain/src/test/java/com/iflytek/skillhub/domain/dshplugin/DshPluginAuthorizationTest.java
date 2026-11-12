package com.iflytek.skillhub.domain.dshplugin;

import com.iflytek.skillhub.domain.namespace.Namespace;
import com.iflytek.skillhub.domain.namespace.NamespaceRole;
import com.iflytek.skillhub.domain.namespace.NamespaceStatus;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class DshPluginAuthorizationTest {

    private final DshPluginAuthorization authorization = new DshPluginAuthorization();

    @Test
    void namespaceMemberMayPublishIntoActiveNamespace() {
        Namespace namespace = namespace(NamespaceStatus.ACTIVE);

        assertThat(authorization.canPublish(namespace, NamespaceRole.MEMBER, Set.of())).isTrue();
        assertThat(authorization.canPublish(namespace, null, Set.of())).isFalse();
    }

    @Test
    void frozenNamespaceRejectsNonAdminPublisher() {
        Namespace namespace = namespace(NamespaceStatus.FROZEN);

        assertThat(authorization.canPublish(namespace, NamespaceRole.OWNER, Set.of())).isFalse();
        assertThat(authorization.canPublish(namespace, null, Set.of("SUPER_ADMIN"))).isTrue();
    }

    @Test
    void creatorNamespaceAdminAndPlatformAdminCanManage() {
        DshPlugin plugin = new DshPlugin(1L, "hello", "@acme/hello", "Hello", "creator");

        assertThat(authorization.canManage(plugin, "creator", Map.of(), Set.of())).isTrue();
        assertThat(authorization.canManage(plugin, "other", Map.of(1L, NamespaceRole.ADMIN), Set.of())).isTrue();
        assertThat(authorization.canManage(plugin, "member", Map.of(1L, NamespaceRole.MEMBER), Set.of())).isFalse();
        assertThat(authorization.canManage(plugin, "other", Map.of(), Set.of("SKILL_ADMIN"))).isTrue();
    }

    private Namespace namespace(NamespaceStatus status) {
        Namespace namespace = new Namespace("acme", "Acme", "owner");
        namespace.setStatus(status);
        return namespace;
    }
}
