const nodemailer = require("nodemailer");

function getMailerConfig() {
  return {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || process.env.SMTP_USER || ""
  };
}

function isMailerConfigured() {
  const config = getMailerConfig();
  return Boolean(config.host && config.port && config.user && config.pass && config.from);
}

async function sendCourseReleasedEmail({ to, userName, courseTitle, dashboardUrl, loginUrl }) {
  if (!isMailerConfigured()) {
    return {
      sent: false,
      skipped: true,
      message: "SMTP nao configurado."
    };
  }

  const config = getMailerConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f1a17; line-height: 1.6;">
      <h2>Seu curso foi liberado</h2>
      <p>Ola, ${userName}.</p>
      <p>O curso <strong>${courseTitle}</strong> foi liberado com sucesso na sua conta.</p>
      <p>Voce pode acessar agora pelo painel do aluno.</p>
      <p>
        <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 18px; background: #a63d40; color: #ffffff; text-decoration: none; border-radius: 10px;">
          Abrir dashboard
        </a>
      </p>
      <p>Se precisar entrar novamente, use este link: <a href="${loginUrl}">${loginUrl}</a></p>
    </div>
  `;

  await transporter.sendMail({
    from: config.from,
    to,
    subject: `Curso liberado: ${courseTitle}`,
    html,
    text: `Ola, ${userName}. O curso "${courseTitle}" foi liberado com sucesso. Acesse seu painel em ${dashboardUrl} ou entre novamente por ${loginUrl}.`
  });

  return {
    sent: true,
    skipped: false
  };
}

module.exports = {
  isMailerConfigured,
  sendCourseReleasedEmail
};
