const { withAndroidManifest, withStringsXml } = require('@expo/config-plugins');

const SITE = 'https://www.hamzawy-sat.dynv6.net';
const ASSET_STATEMENTS = JSON.stringify([{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'web', site: SITE },
}]);

module.exports = function withHamzawyAssetStatements(config) {
  config = withStringsXml(config, (mod) => {
    const strings = mod.modResults.resources.string || (mod.modResults.resources.string = []);
    const existing = strings.find((item) => item.$?.name === 'asset_statements');
    if (existing) existing._ = ASSET_STATEMENTS;
    else strings.push({ $: { name: 'asset_statements' }, _: ASSET_STATEMENTS });
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android application node missing for asset statements');
    application['meta-data'] = (application['meta-data'] || []).filter((item) => item.$?.['android:name'] !== 'asset_statements');
    application['meta-data'].push({ $: { 'android:name': 'asset_statements', 'android:resource': '@string/asset_statements' } });
    return mod;
  });
  return config;
};
