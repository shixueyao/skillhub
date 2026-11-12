package com.iflytek.skillhub.domain.dshplugin;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DshPluginSlugTest {

    @Test
    void derivesRegistrySlugFromScopedPackageName() {
        assertThat(DshPluginPublishService.slugFor("@astron-team/skillhub-dsh"))
                .isEqualTo("skillhub-dsh");
        assertThat(DshPluginPublishService.slugFor("hello-dsh"))
                .isEqualTo("hello-dsh");
    }

    @Test
    void appendsSuffixWhenPackageSuffixWouldBeReserved() {
        assertThat(DshPluginPublishService.slugFor("@acme/admin"))
                .isEqualTo("admin-plugin");
    }

    @Test
    void truncatesLongNameWithinSlugLimit() {
        String slug = DshPluginPublishService.slugFor(
                "@acme/" + "a".repeat(120));

        assertThat(slug.length()).isLessThanOrEqualTo(64);
        assertThat(slug).startsWith("a");
    }
}
