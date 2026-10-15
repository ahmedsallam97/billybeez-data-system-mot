require('../e2e/account-fixtures').installLanguageFixture();
// Existing behavior checks, run against the same disposable layout-test database.
require('../e2e/stabilization-editors.spec');
require('../e2e/stabilization-photo-framing.spec');
require('../e2e/stabilization-print-share.spec');
require('../e2e/dashboard-settings.spec');

require('../e2e/stabilization-schedule.spec');

for(const file of ['operations-shell','operations-mutations','stabilization-daily-workflows','stabilization-uploads','stabilization-config-errors','read-only','stabilization-stock','stabilization-leave','stabilization-employee-profile','operations'])require('../e2e/'+file+'.spec');

require('../e2e/print-responsive.spec');
