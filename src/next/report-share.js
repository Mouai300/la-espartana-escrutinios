'use strict';

const {
  createReport
} = require('./report');
function fault(code) {
  throw Object.assign(new Error(code), {
    code
  });
}
function createReportShare({
  workspace,
  render,
  share,
  remove,
  now,
  logo,
  available = async () => true
}) {
  let busy = false;
  return {
    async export(fileId, variant) {
      if (busy) fault('REPORT_BUSY');
      busy = true;
      let uri = null;
      try {
        const ticket = workspace.ticket(),
          {
            state
          } = workspace.snapshot(),
          report = createReport(state, fileId, {
            variant,
            createdAt: now(),
            logo: logo()
          });
        workspace.assertTicket(ticket);
        const value = await render(report.html, report.label, report.footer);
        if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('file:///') || /[?#]/.test(value)) fault('REPORT_URI_INVALID');
        uri = value;
        workspace.assertTicket(ticket);
        if (!(await available())) fault('REPORT_SHARING_UNAVAILABLE');
        workspace.assertTicket(ticket);
        await share(uri);
        return {
          handedToSystem: true
        };
      } finally {
        if (uri) try {
          await remove(uri);
        } catch {}
        busy = false;
      }
    }
  };
}
module.exports = {
  createReportShare
};
