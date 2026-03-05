import en from '../../../messages/en.json';

describe('i18n message catalog', () => {
  it('has required auth keys', () => {
    expect(en.auth.login).toBeDefined();
    expect(en.auth.email).toBeDefined();
    expect(en.auth.password).toBeDefined();
    expect(en.auth.logout).toBeDefined();
    expect(en.auth.login_button).toBeDefined();
  });

  it('has required nav keys', () => {
    expect(en.nav.dashboard).toBeDefined();
    expect(en.nav.clusters).toBeDefined();
    expect(en.nav.settings).toBeDefined();
    expect(en.nav.terminal).toBeDefined();
    expect(en.nav.monitoring).toBeDefined();
  });

  it('has required settings keys', () => {
    expect(en.settings.nav.profile).toBeDefined();
    expect(en.settings.nav.roles).toBeDefined();
    expect(en.settings.nav.users).toBeDefined();
    expect(en.settings.nav.plugins).toBeDefined();
    expect(en.settings.nav.oidc).toBeDefined();
  });

  it('has required settings.profile keys', () => {
    expect(en.settings.profile.title).toBeDefined();
    expect(en.settings.profile.account).toBeDefined();
    expect(en.settings.profile.security).toBeDefined();
    expect(en.settings.profile.preferences).toBeDefined();
    expect(en.settings.profile.theme).toBeDefined();
    expect(en.settings.profile.theme_system).toBeDefined();
    expect(en.settings.profile.theme_light).toBeDefined();
    expect(en.settings.profile.theme_dark).toBeDefined();
  });

  it('has required settings.roles keys', () => {
    expect(en.settings.roles.title).toBeDefined();
    expect(en.settings.roles.create_role).toBeDefined();
    expect(en.settings.roles.delete_role).toBeDefined();
    expect(en.settings.roles.tabs.roles).toBeDefined();
    expect(en.settings.roles.tabs.assignments).toBeDefined();
  });

  it('has required rbac keys', () => {
    expect(en.rbac.resources.clusters).toBeDefined();
    expect(en.rbac.resources.apps).toBeDefined();
    expect(en.rbac.actions.read).toBeDefined();
    expect(en.rbac.actions.write).toBeDefined();
    expect(en.rbac.actions.delete).toBeDefined();
    expect(en.rbac.scope.global).toBeDefined();
    expect(en.rbac.scope.cluster).toBeDefined();
    expect(en.rbac.scope.namespace).toBeDefined();
  });

  it('has required common keys', () => {
    expect(en.common.save).toBeDefined();
    expect(en.common.cancel).toBeDefined();
    expect(en.common.delete).toBeDefined();
    expect(en.common.edit).toBeDefined();
    expect(en.common.create).toBeDefined();
    expect(en.common.loading).toBeDefined();
  });

  it('has required clusters keys', () => {
    expect(en.clusters.title).toBeDefined();
    expect(en.clusters.add_cluster).toBeDefined();
    expect(en.clusters.status.healthy).toBeDefined();
  });
});
