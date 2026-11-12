package com.iflytek.skillhub.domain.dshplugin;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class DshPluginRealTarballProbeTest {

    @Test
    @EnabledIfSystemProperty(named = "dsh.plugin.fixture", matches = ".+")
    void parsesPublishedNpmTarball() {
        DshPluginPackage parsed = DshPluginPackageParser.parse(
                Path.of(System.getProperty("dsh.plugin.fixture")),
                DshPluginPackageParser.Limits.defaults());

        assertThat(parsed.packageName()).isEqualTo("@astron-team/skillhub-dsh");
        assertThat(parsed.version()).isEqualTo("0.6.2");
        assertThat(parsed.capabilities()).containsExactlyInAnyOrder("bundle", "client");
    }
}
