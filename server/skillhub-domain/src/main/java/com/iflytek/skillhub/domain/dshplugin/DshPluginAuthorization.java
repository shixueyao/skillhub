package com.iflytek.skillhub.domain.dshplugin;

import com.iflytek.skillhub.domain.namespace.Namespace;
import com.iflytek.skillhub.domain.namespace.NamespaceRole;
import com.iflytek.skillhub.domain.namespace.NamespaceStatus;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Set;

/**
 * Central authorization policy for DSH plugin hosting.
 *
 * <p>Publishing follows the skill model: any member of an active namespace may
 * publish (the first publish claims the package name), while platform admins
 * bypass membership. Managing an existing plugin is limited to its creator, the
 * namespace's owners/admins, or platform admins.
 */
@Component
public class DshPluginAuthorization {

    private static final Set<String> PLATFORM_MANAGERS = Set.of("SUPER_ADMIN", "SKILL_ADMIN");

    public boolean canPublish(Namespace namespace, NamespaceRole memberRole, Set<String> platformRoles) {
        if (isPlatformManager(platformRoles)) {
            return true;
        }
        return namespace.getStatus() == NamespaceStatus.ACTIVE && memberRole != null;
    }

    public boolean canManage(DshPlugin plugin,
                             String userId,
                             Map<Long, NamespaceRole> namespaceRoles,
                             Set<String> platformRoles) {
        return canManage(plugin.getNamespaceId(), plugin.getCreatedBy(), userId, namespaceRoles, platformRoles);
    }

    public boolean canManage(Long namespaceId,
                             String createdBy,
                             String userId,
                             Map<Long, NamespaceRole> namespaceRoles,
                             Set<String> platformRoles) {
        if (isPlatformManager(platformRoles)) {
            return true;
        }
        if (userId != null && userId.equals(createdBy)) {
            return true;
        }
        NamespaceRole role = namespaceRoles == null ? null : namespaceRoles.get(namespaceId);
        return role == NamespaceRole.OWNER || role == NamespaceRole.ADMIN;
    }

    public boolean isPlatformManager(Set<String> platformRoles) {
        if (platformRoles == null) {
            return false;
        }
        for (String role : platformRoles) {
            if (PLATFORM_MANAGERS.contains(role)) {
                return true;
            }
        }
        return false;
    }
}
