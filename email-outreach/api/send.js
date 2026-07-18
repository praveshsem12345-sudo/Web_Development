import { sendMail } from '../lib/sendMail.js';

export function createHandler(sendMailImpl) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const { smtp, to, subject, text } = req.body || {};

    if (!smtp || !smtp.host || !smtp.user || !smtp.pass || !to) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }

    const result = await sendMailImpl({ smtp, message: { to, subject, text } });
    res.status(result.ok ? 200 : 502).json(result);
  };
}

export default createHandler(sendMailWrapper);

async function sendMailWrapper({ smtp, message }) {
  return sendMail({ smtp, message });
}
