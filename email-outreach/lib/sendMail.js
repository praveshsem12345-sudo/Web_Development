import nodemailer from 'nodemailer';

function defaultTransportFactory(config) {
  return nodemailer.createTransport(config);
}

export async function sendMail({ smtp, message, transportFactory = defaultTransportFactory }) {
  const transport = transportFactory({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  try {
    const result = await transport.sendMail({
      from: smtp.user,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return { ok: true, messageId: result.messageId };
  } catch (err) {
    let error;
    if (err && err.code === 'EAUTH') {
      error = 'SMTP authentication failed. Check your email address and app password.';
    } else if (err && (err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT' || err.code === 'ESOCKET')) {
      error = 'Could not connect to the SMTP server. Check the host and port.';
    } else {
      error = 'Failed to send email.';
    }
    return { ok: false, error };
  }
}
