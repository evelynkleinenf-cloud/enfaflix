require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { isMailerConfigured, sendCourseReleasedEmail } = require("./src/mailer");
const { getAppConfig, validateProductionConfig } = require("./src/config");
const {
  initDatabase,
  createUser,
  createCourse,
  createLesson,
  updateLessonAssets,
  updateCourse,
  deleteCourse,
  updateLesson,
  deleteLesson,
  createOrder,
  getOrderById,
  listOrdersByUser,
  listPendingOrders,
  approveOrder,
  approveOrdersByGroup,
  listOrdersByGroupReference,
  createPromoCode,
  listPromoCodes,
  findPromoCodeByCode,
  countPromoCodeRedemptions,
  deletePromoCode,
  completeLesson,
  listCompletedLessonIdsByCourse,
  getCourseProgress,
  issueCertificate,
  getCertificate,
  saveCourseEvaluation,
  getCourseEvaluation,
  getAdminStats,
  listAdminEvaluations,
  findUserByEmail,
  findUserById,
  listCourses,
  listDashboardCourses,
  enrollUserInCourse,
  userHasEnrollment,
  createCourseMaterial,
  listCourseMaterials,
  getCourseMaterialById,
  deleteCourseMaterial,
  getCourseById,
  listLessonsByCourse,
  getLessonById
} = require("./src/db");

const app = express();
const appConfig = getAppConfig();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const storageRoot = path.join(__dirname, "storage", "courses");
const JWT_SECRET = appConfig.jwtSecret;
const COOKIE_NAME = "enfaflix_token";

ensureStorageRoot();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(publicDir));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      nome: user.nome,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function sanitizeUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    isAdmin: Boolean(user.isAdmin),
    createdAt: user.createdAt
  };
}

function ensureStorageRoot() {
  fs.mkdirSync(storageRoot, { recursive: true });
}

function ensureCourseLessonDir(courseId, lessonId) {
  const lessonDir = path.join(storageRoot, `course-${courseId}`, `lesson-${lessonId}`);
  fs.mkdirSync(lessonDir, { recursive: true });
  return lessonDir;
}

function getCourseDir(courseId) {
  return path.join(storageRoot, `course-${courseId}`);
}

function getLessonDir(courseId, lessonId) {
  return path.join(getCourseDir(courseId), `lesson-${lessonId}`);
}

function ensureCourseMaterialsDir(courseId) {
  const materialsDir = path.join(getCourseDir(courseId), "materials");
  fs.mkdirSync(materialsDir, { recursive: true });
  return materialsDir;
}

function sanitizeFileName(fileName) {
  return String(fileName || "arquivo")
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, "-")
    .replace(/-+/g, "-");
}

function writeUploadedFile(targetDir, file, fallbackName) {
  if (!file) {
    return null;
  }

  const safeName = sanitizeFileName(file.originalname || fallbackName);
  const finalName = `${Date.now()}-${safeName || fallbackName}`;
  const targetPath = path.join(targetDir, finalName);
  fs.writeFileSync(targetPath, file.buffer);
  return path.relative(__dirname, targetPath).replace(/\\/g, "/");
}

function removeDirIfExists(targetDir) {
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

function extractYouTubeEmbedUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return null;
  }

  try {
    const url = new URL(rawValue);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const videoId = url.pathname.replace(/\//g, "").trim();
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        const videoId = url.searchParams.get("v");
        return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
      }

      if (url.pathname.startsWith("/embed/")) {
        return rawValue;
      }
    }
  } catch (error) {
    return null;
  }

  return null;
}

async function maybeIssueCertificate(userId, courseId) {
  const progress = await getCourseProgress(userId, courseId);
  const evaluation = await getCourseEvaluation(userId, courseId);
  let certificate = null;
  const eligible = Boolean(progress.completed && evaluation);

  if (eligible) {
    certificate = await getCertificate(userId, courseId);

    if (!certificate) {
      certificate = await issueCertificate(userId, courseId);
    }
  }

  return {
    progress,
    evaluation,
    certificate,
    certificateEligible: eligible
  };
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function getUserFromRequest(req) {
  const token = req.cookies[COOKIE_NAME];

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return await findUserById(payload.sub);
  } catch (error) {
    return null;
  }
}

const requireAuth = asyncHandler(async (req, res, next) => {
  const user = await getUserFromRequest(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Você precisa estar autenticado."
    });
  }

  req.user = user;
  next();
});

const requireAdmin = asyncHandler(async (req, res, next) => {
  const user = await getUserFromRequest(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Você precisa estar autenticado."
    });
  }

  if (!user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: "Acesso restrito a administradores."
    });
  }

  req.user = user;
  next();
});

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function getPixConfig() {
  return {
    key: process.env.PIX_KEY || "",
    beneficiary: process.env.PIX_BENEFICIARY || "",
    qrCodeImageUrl: process.env.PIX_QR_CODE_IMAGE_URL || "",
    copyPasteCode: process.env.PIX_COPY_PASTE_CODE || ""
  };
}

function ensureLocalUploadsAllowed() {
  if (!appConfig.allowLocalFileUploads) {
    const error = new Error("Uploads locais estao desativados neste ambiente. Use links externos para materiais ou habilite ALLOW_LOCAL_FILE_UPLOADS.");
    error.status = 400;
    throw error;
  }
}

function formatCurrencyBRL(amountCents) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format((amountCents || 0) / 100);
}

function isPromoExpired(promoCode) {
  return Boolean(promoCode.expiresAt && new Date(promoCode.expiresAt).getTime() < Date.now());
}

async function buildCheckoutSummary(courseIds, promoCodeInput) {
  const uniqueCourseIds = [...new Set(courseIds.map((id) => Number(id)).filter(Boolean))];
  const courses = [];

  for (const courseId of uniqueCourseIds) {
    const course = await getCourseById(courseId);
    if (course) {
      courses.push(course);
    }
  }

  const subtotalCents = courses.reduce((total, course) => total + (course.priceCents || 0), 0);
  const bundleDiscountCents = courses.length >= 2 ? Math.round(subtotalCents * 0.1) : 0;
  const promoCode = promoCodeInput ? await findPromoCodeByCode(promoCodeInput) : null;
  let promoDiscountCents = 0;
  let promoBaseCents = 0;
  let promoMessage = "";
  let appliedPromoCode = null;

  if (promoCode && promoCode.active) {
    const redemptionsCount = await countPromoCodeRedemptions(promoCode.code);

    if (isPromoExpired(promoCode)) {
      promoMessage = "Esta promoção expirou.";
    } else if (promoCode.maxRedemptions && redemptionsCount >= promoCode.maxRedemptions) {
      promoMessage = "Esta promoção atingiu o limite de alunos.";
    } else {
      const eligibleCourseIds = Array.isArray(promoCode.eligibleCourseIds) ? promoCode.eligibleCourseIds : [];
      const eligibleCourses = eligibleCourseIds.length > 0
        ? courses.filter((course) => eligibleCourseIds.includes(course.id))
        : courses;

      if (eligibleCourses.length >= Math.max(1, promoCode.minCourses || 1)) {
        promoBaseCents = eligibleCourses.reduce((total, course) => total + (course.priceCents || 0), 0);

        if (promoCode.discountType === "percent") {
          promoDiscountCents = Math.round(promoBaseCents * (promoCode.discountValue / 100));
        } else {
          promoDiscountCents = promoCode.discountValue;
        }

        promoDiscountCents = Math.min(promoBaseCents, promoDiscountCents);
        appliedPromoCode = promoCode;
        promoMessage = promoCode.title
          ? `${promoCode.title} aplicada com sucesso.`
          : `Cupom ${promoCode.code} aplicado com sucesso.`;
      } else {
        promoMessage = eligibleCourseIds.length > 0
          ? `Esta promoção exige ${Math.max(1, promoCode.minCourses || 1)} curso(s) específico(s) do combo selecionado.`
          : `Esta promoção exige pelo menos ${Math.max(1, promoCode.minCourses || 1)} curso(s) no pedido.`;
      }
    }
  } else if (promoCodeInput) {
    promoMessage = "Cupom não encontrado ou inativo.";
  }

  const totalDiscountCents = Math.min(subtotalCents, bundleDiscountCents + promoDiscountCents);
  const totalCents = Math.max(0, subtotalCents - totalDiscountCents);

  return {
    courses,
    subtotalCents,
    bundleDiscountCents,
    promoDiscountCents,
    promoBaseCents,
    totalDiscountCents,
    totalCents,
    promoCode: appliedPromoCode,
    promoMessage
  };
}

async function releaseCourseAndNotify({ user, courseId, paymentNote }) {
  const course = await getCourseById(courseId, user.id);
  await enrollUserInCourse(user.id, courseId);

  const appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
  const mailResult = await sendCourseReleasedEmail({
    to: user.email,
    userName: user.nome,
    courseTitle: course.title,
    dashboardUrl: `${appBaseUrl}/dashboard`,
    loginUrl: `${appBaseUrl}/login`
  });

  return {
    course,
    mailResult,
    paymentNote: paymentNote || ""
  };
}

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/cadastro", (req, res) => {
  res.sendFile(path.join(publicDir, "cadastro.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.get("/cursos", (req, res) => {
  res.sendFile(path.join(publicDir, "courses.html"));
});

app.get("/gestao", asyncHandler(async (req, res) => {
  const user = await getUserFromRequest(req);

  if (!user) {
    return res.redirect("/login");
  }

  if (!user.isAdmin) {
    return res.redirect("/");
  }

  res.sendFile(path.join(publicDir, "admin.html"));
}));

app.get("/comprar", (req, res) => {
  res.sendFile(path.join(publicDir, "checkout.html"));
});

app.get("/comprar/:id", (req, res) => {
  res.sendFile(path.join(publicDir, "checkout.html"));
});

app.get("/certificado/:courseId", (req, res) => {
  res.sendFile(path.join(publicDir, "certificate.html"));
});

app.get("/aula/:id", (req, res) => {
  res.sendFile(path.join(publicDir, "lesson.html"));
});

app.get("/api/session", asyncHandler(async (req, res) => {
  const user = await getUserFromRequest(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Nenhuma sess?o ativa."
    });
  }

  res.json({
    success: true,
    user: sanitizeUser(user)
  });
}));

app.get("/api/protegido", requireAuth, (req, res) => {
  res.json({
    success: true,
    message: `Bem-vindo, ${req.user.nome}. Sua sess?o est? ativa.`,
    user: sanitizeUser(req.user)
  });
});

app.get("/api/dashboard", requireAuth, asyncHandler(async (req, res) => {
  const courses = await listDashboardCourses(req.user.id);
  const coursesWithProgress = await Promise.all(
    courses.map(async (course) => {
      const certificateStatus = await maybeIssueCertificate(req.user.id, course.id);
      const materials = await listCourseMaterials(course.id);

      return {
        ...course,
        progress: certificateStatus.progress,
        certificate: certificateStatus.certificate,
        evaluationSubmitted: Boolean(certificateStatus.evaluation),
        certificateEligible: certificateStatus.certificateEligible,
        materialsCount: materials.length
      };
    })
  );

  res.json({
    success: true,
    user: sanitizeUser(req.user),
    stats: {
      enrolledCourses: courses.length,
      completedCourses: coursesWithProgress.filter((course) => course.progress.completed).length
    },
    courses: coursesWithProgress
  });
}));

app.get("/api/courses", asyncHandler(async (req, res) => {
  const currentUser = await getUserFromRequest(req);
  const courses = await listCourses(currentUser ? currentUser.id : null);

  res.json({
    success: true,
    user: currentUser ? sanitizeUser(currentUser) : null,
    courses
  });
}));

app.get("/api/courses/:id", asyncHandler(async (req, res) => {
  const currentUser = await getUserFromRequest(req);
  const courseId = Number(req.params.id);
  const course = await getCourseById(courseId, currentUser ? currentUser.id : null);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Curso n?o encontrado."
    });
  }

  const lessons = await listLessonsByCourse(courseId);

  res.json({
    success: true,
    course,
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      position: lesson.position,
      hasVideo: Boolean(lesson.videoPath),
      hasPdf: Boolean(lesson.pdfPath),
      hasTextFile: Boolean(lesson.textFilePath),
      locked: !course.enrolled
    }))
  });
}));

app.get("/api/orders", requireAuth, asyncHandler(async (req, res) => {
  const orders = await listOrdersByUser(req.user.id);

  res.json({
    success: true,
    orders
  });
}));

app.get("/api/orders/pending", requireAdmin, asyncHandler(async (req, res) => {
  const orders = await listPendingOrders();

  res.json({
    success: true,
    orders
  });
}));

app.get("/api/admin/promo-codes", requireAdmin, asyncHandler(async (req, res) => {
  const promoCodes = await listPromoCodes();
  const promoCodesWithUsage = await Promise.all(
    promoCodes.map(async (promoCode) => ({
      ...promoCode,
      redemptionsCount: await countPromoCodeRedemptions(promoCode.code)
    }))
  );

  res.json({
    success: true,
    promoCodes: promoCodesWithUsage
  });
}));

app.get("/api/promotions", asyncHandler(async (req, res) => {
  const promoCodes = await listPromoCodes();
  const activePromotions = [];

  for (const promoCode of promoCodes) {
    const redemptionsCount = await countPromoCodeRedemptions(promoCode.code);

    if (!promoCode.active || isPromoExpired(promoCode) || (promoCode.maxRedemptions && redemptionsCount >= promoCode.maxRedemptions)) {
      continue;
    }

    const eligibleCourseIds = Array.isArray(promoCode.eligibleCourseIds) ? promoCode.eligibleCourseIds : [];
    if (eligibleCourseIds.length === 0) {
      continue;
    }
    const baseCourseIds = eligibleCourseIds.length > 0 ? eligibleCourseIds : [];
    const courses = [];

    for (const courseId of baseCourseIds) {
      const course = await getCourseById(courseId);
      if (course) {
        courses.push(course);
      }
    }

    const minCourses = Math.max(1, promoCode.minCourses || 1);
    const relevantCourses = courses.length >= minCourses ? courses.slice(0, Math.max(minCourses, courses.length)) : courses;
    const normalPriceCents = relevantCourses.reduce((total, course) => total + (course.priceCents || 0), 0);
    const discountedPriceCents = promoCode.discountType === "percent"
      ? Math.max(0, normalPriceCents - Math.round(normalPriceCents * (promoCode.discountValue / 100)))
      : Math.max(0, normalPriceCents - promoCode.discountValue);

    activePromotions.push({
      ...promoCode,
      redemptionsCount,
      remainingRedemptions: promoCode.maxRedemptions ? Math.max(0, promoCode.maxRedemptions - redemptionsCount) : null,
      courses: relevantCourses.map((course) => ({
        id: course.id,
        title: course.title,
        priceCents: course.priceCents
      })),
      normalPriceCents,
      discountedPriceCents
    });
  }

  res.json({
    success: true,
    promotions: activePromotions
  });
}));

app.get("/api/admin/stats", requireAdmin, asyncHandler(async (req, res) => {
  const stats = await getAdminStats();

  res.json({
    success: true,
    stats
  });
}));

app.get("/api/admin/evaluations", requireAdmin, asyncHandler(async (req, res) => {
  const evaluations = await listAdminEvaluations();

  res.json({
    success: true,
    evaluations
  });
}));

app.get("/api/checkout-summary", requireAuth, asyncHandler(async (req, res) => {
  const courseIds = String(req.query.ids || "")
    .split(",")
    .map((value) => Number(value))
    .filter(Boolean);
  const promoCode = String(req.query.promoCode || "").trim();
  const summary = await buildCheckoutSummary(courseIds, promoCode);

  if (summary.courses.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Selecione pelo menos um curso para continuar."
    });
  }

  res.json({
    success: true,
    summary: {
      ...summary,
      subtotalFormatted: formatCurrencyBRL(summary.subtotalCents),
      bundleDiscountFormatted: formatCurrencyBRL(summary.bundleDiscountCents),
      promoDiscountFormatted: formatCurrencyBRL(summary.promoDiscountCents),
      totalFormatted: formatCurrencyBRL(summary.totalCents)
    },
    pix: getPixConfig()
  });
}));

app.post("/api/checkout/order", requireAuth, asyncHandler(async (req, res) => {
  const courseIds = Array.isArray(req.body.courseIds) ? req.body.courseIds.map(Number) : [];
  const promoCodeInput = String(req.body.promoCode || "").trim();
  const summary = await buildCheckoutSummary(courseIds, promoCodeInput);

  if (summary.courses.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Selecione pelo menos um curso para gerar o pedido."
    });
  }

  const groupReference = `GRP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const totalOriginal = summary.subtotalCents || 1;
  const createdOrders = [];

  for (const course of summary.courses) {
    const proportionalDiscount = Math.round((course.priceCents / totalOriginal) * summary.totalDiscountCents);
    const order = await createOrder({
      userId: req.user.id,
      courseId: course.id,
      amountCents: Math.max(0, course.priceCents - proportionalDiscount),
      originalAmountCents: course.priceCents,
      discountCents: proportionalDiscount,
      promoCode: summary.promoCode ? summary.promoCode.code : null,
      groupReference
    });

    createdOrders.push(order);
  }

  res.json({
    success: true,
    message: `Pedido em grupo ${groupReference} criado com sucesso.`,
    groupReference,
    orders: createdOrders,
    totalFormatted: formatCurrencyBRL(summary.totalCents)
  });
}));

app.post("/api/courses/:id/enroll", requireAuth, asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  const course = await getCourseById(courseId, req.user.id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Curso n?o encontrado."
    });
  }

  await enrollUserInCourse(req.user.id, courseId);

  res.json({
    success: true,
    message: `Matrcula confirmada no curso ${course.title}.`
  });
}));

app.post("/api/admin/release-course", requireAdmin, asyncHandler(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const courseId = Number(req.body.courseId);
  const user = await findUserByEmail(email);
  const course = await getCourseById(courseId, req.user.id);

  if (!email || !courseId) {
    return res.status(400).json({
      success: false,
      message: "Informe o e-mail do aluno e o curso."
    });
  }

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "Aluno n?o encontrado com este e-mail."
    });
  }

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Curso n?o encontrado."
    });
  }

  const { mailResult } = await releaseCourseAndNotify({
    user,
    courseId
  });

  res.json({
    success: true,
    message: mailResult.sent
      ? `Curso ${course.title} liberado e e-mail enviado para ${user.email}.`
      : `Curso ${course.title} liberado. E-mail não enviado: ${mailResult.message}`,
    mail: mailResult
  });
}));

app.post("/api/admin/orders/:id/approve", requireAdmin, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id);
  const paymentNote = String(req.body.paymentNote || "").trim();
  const order = await getOrderById(orderId);

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Pedido n?o encontrado."
    });
  }

  if (order.status === "approved") {
    return res.status(400).json({
      success: false,
      message: "Este pedido j foi aprovado."
    });
  }

  const user = await findUserByEmail(order.userEmail);
  const approvedOrders = order.groupReference
    ? await approveOrdersByGroup(order.groupReference, paymentNote)
    : [await approveOrder(orderId, paymentNote)];

  let lastCourse = null;
  let lastMailResult = null;
  for (const approvedOrder of approvedOrders) {
    const result = await releaseCourseAndNotify({
      user,
      courseId: approvedOrder.courseId,
      paymentNote
    });
    lastCourse = result.course;
    lastMailResult = result.mailResult;
  }

  res.json({
    success: true,
    message: lastMailResult && lastMailResult.sent
      ? `Pedido${order.groupReference ? " em grupo " + order.groupReference : " " + order.reference} aprovado, cursos liberados e e-mail enviado.`
      : `Pedido${order.groupReference ? " em grupo " + order.groupReference : " " + order.reference} aprovado e cursos liberados. E-mail não enviado: ${lastMailResult ? lastMailResult.message : "SMTP não configurado."}`,
    orders: approvedOrders,
    mail: lastMailResult
  });
}));

app.post("/api/admin/promo-codes", requireAdmin, asyncHandler(async (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const discountType = String(req.body.discountType || "percent").trim();
  const discountValue = Number(req.body.discountValue || 0);
  const minCourses = Math.max(1, Number(req.body.minCourses || 1));
  const eligibleCourseIds = Array.isArray(req.body.eligibleCourseIds)
    ? req.body.eligibleCourseIds.map(Number).filter(Boolean)
    : [];
  const maxRedemptions = req.body.maxRedemptions ? Math.max(1, Number(req.body.maxRedemptions)) : null;
  let expiresAt = null;

  if (req.body.expiresAt) {
    const expirationDate = new Date(req.body.expiresAt);
    if (Number.isNaN(expirationDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Data limite da promoo invlida."
      });
    }
    expiresAt = expirationDate.toISOString();
  }

  if (!code) {
    return res.status(400).json({
      success: false,
      message: "Informe o c?digo promocional."
    });
  }

  if (!["percent", "fixed"].includes(discountType)) {
    return res.status(400).json({
      success: false,
      message: "Tipo de desconto invlido."
    });
  }

  if (discountValue <= 0) {
    return res.status(400).json({
      success: false,
      message: "Informe um valor de desconto maior que zero."
    });
  }

  const promoCode = await createPromoCode({
    code,
    title,
    description,
    discountType,
    discountValue,
    minCourses,
    eligibleCourseIds,
    maxRedemptions,
    expiresAt
  });

  res.json({
    success: true,
    message: `Promoo ${promoCode.title} criada com sucesso.`,
    promoCode
  });
}));

app.delete("/api/admin/promo-codes/:id", requireAdmin, asyncHandler(async (req, res) => {
  await deletePromoCode(Number(req.params.id));
  res.json({
    success: true,
    message: "Cdigo promocional removido com sucesso."
  });
}));

app.get("/api/lessons/:id", requireAuth, asyncHandler(async (req, res) => {
  const lessonId = Number(req.params.id);
  const lesson = await getLessonById(lessonId);

  if (!lesson) {
    return res.status(404).json({
      success: false,
      message: "Aula n?o encontrada."
    });
  }

  const hasAccess = await userHasEnrollment(req.user.id, lesson.courseId);

  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: "Contedo bloqueado. Matricule-se no curso para acessar esta aula.",
      courseId: lesson.courseId
    });
  }

  const lessons = await listLessonsByCourse(lesson.courseId);
  const completedLessonIds = await listCompletedLessonIdsByCourse(req.user.id, lesson.courseId);
  const certificateStatus = await maybeIssueCertificate(req.user.id, lesson.courseId);
  const materials = await listCourseMaterials(lesson.courseId);

  res.json({
    success: true,
    lesson,
    assets: {
      videoUrl: lesson.videoPath ? `/api/lessons/${lesson.id}/assets/video` : null,
      youtubeEmbedUrl: lesson.youtubeUrl || null,
      pdfUrl: lesson.pdfPath ? `/api/lessons/${lesson.id}/assets/pdf` : null,
      textDownloadUrl: lesson.textFilePath ? `/api/lessons/${lesson.id}/assets/text` : null
    },
    progress: certificateStatus.progress,
    certificate: certificateStatus.certificate,
    evaluation: certificateStatus.evaluation,
    certificateEligible: certificateStatus.certificateEligible,
    materials,
    navigation: lessons.map((item) => ({
      id: item.id,
      title: item.title,
      position: item.position,
      completed: completedLessonIds.includes(item.id)
    }))
  });
}));

app.post("/api/lessons/:id/complete", requireAuth, asyncHandler(async (req, res) => {
  const lessonId = Number(req.params.id);
  const lesson = await getLessonById(lessonId);

  if (!lesson) {
    return res.status(404).json({
      success: false,
      message: "Aula n?o encontrada."
    });
  }

  const hasAccess = await userHasEnrollment(req.user.id, lesson.courseId);

  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: "Contedo bloqueado."
    });
  }

  await completeLesson(req.user.id, lessonId);
  const certificateStatus = await maybeIssueCertificate(req.user.id, lesson.courseId);

  res.json({
    success: true,
    message: certificateStatus.progress.completed
      ? "Todas as aulas foram marcadas como assistidas. Envie a avalia??o final para liberar o certificado."
      : "Aula marcada como assistida.",
    progress: certificateStatus.progress,
    certificate: certificateStatus.certificate,
    evaluationSubmitted: Boolean(certificateStatus.evaluation),
    certificateEligible: certificateStatus.certificateEligible
  });
}));

app.post("/api/courses/:id/evaluation", requireAuth, asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  const course = await getCourseById(courseId, req.user.id);
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || "").trim();
  const answers = req.body.answers || {};

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Curso n?o encontrado."
    });
  }

  const progress = await getCourseProgress(req.user.id, courseId);
  if (!progress.completed) {
    return res.status(400).json({
      success: false,
      message: "Conclua todas as aulas antes de enviar a avalia??o."
    });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      message: "Escolha uma nota de 1 a 5."
    });
  }

  const evaluation = await saveCourseEvaluation(req.user.id, courseId, {
    rating,
    comment,
    answersJson: JSON.stringify(answers)
  });
  const certificateStatus = await maybeIssueCertificate(req.user.id, courseId);

  res.json({
    success: true,
    message: certificateStatus.certificate
      ? "Avalia??o enviada com sucesso. Seu certificado j? foi liberado."
      : "Avalia??o enviada com sucesso.",
    evaluation,
    certificate: certificateStatus.certificate
  });
}));

app.get("/api/certificates/:courseId", requireAuth, asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  const certificateStatus = await maybeIssueCertificate(req.user.id, courseId);
  const certificate = certificateStatus.certificate;

  if (!certificate) {
    return res.status(404).json({
      success: false,
      message: "Certificado ainda n?o dispon?vel para este curso."
    });
  }

  res.json({
    success: true,
    certificate
  });
}));

app.get("/api/lessons/:id/assets/:type", requireAuth, asyncHandler(async (req, res) => {
  const lessonId = Number(req.params.id);
  const assetType = req.params.type;
  const lesson = await getLessonById(lessonId);

  if (!lesson) {
    return res.status(404).json({
      success: false,
      message: "Aula n?o encontrada."
    });
  }

  const hasAccess = await userHasEnrollment(req.user.id, lesson.courseId);

  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: "Contedo bloqueado."
    });
  }

  const assetMap = {
    video: lesson.videoPath,
    pdf: lesson.pdfPath,
    text: lesson.textFilePath
  };

  const relativePath = assetMap[assetType];

  if (!relativePath) {
    return res.status(404).json({
      success: false,
      message: "Arquivo n?o encontrado para esta aula."
    });
  }

  const absolutePath = path.join(__dirname, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({
      success: false,
      message: "Arquivo n?o encontrado no armazenamento local."
    });
  }

  res.sendFile(absolutePath);
}));

app.get("/api/course-materials/:id/download", requireAuth, asyncHandler(async (req, res) => {
  const material = await getCourseMaterialById(Number(req.params.id));

  if (!material) {
    return res.status(404).json({
      success: false,
      message: "Material complementar não encontrado."
    });
  }

  const hasAccess = await userHasEnrollment(req.user.id, material.courseId);

  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: "Acesso restrito aos materiais deste curso."
    });
  }

  const absolutePath = path.join(__dirname, material.filePath);

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({
      success: false,
      message: "Arquivo complementar não encontrado."
    });
  }

  res.sendFile(absolutePath);
}));

app.post("/api/admin/courses", requireAdmin, asyncHandler(async (req, res) => {
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const priceCents = Math.round(Number(req.body.price || 0) * 100);

  if (!title) {
    return res.status(400).json({
      success: false,
      message: "Informe o ttulo do curso."
    });
  }

  if (priceCents < 0) {
    return res.status(400).json({
      success: false,
      message: "Informe um pre?o v?lido para o curso."
    });
  }

  const course = await createCourse({ title, description, priceCents });
  fs.mkdirSync(path.join(storageRoot, `course-${course.id}`), { recursive: true });

  res.json({
    success: true,
    message: `Curso ${course.title} criado com sucesso.`,
    course
  });
}));

app.get("/api/admin/lessons/:id", requireAdmin, asyncHandler(async (req, res) => {
  const lessonId = Number(req.params.id);
  const lesson = await getLessonById(lessonId);

  if (!lesson) {
    return res.status(404).json({
      success: false,
      message: "Aula n?o encontrada."
    });
  }

  res.json({
    success: true,
    lesson
  });
}));

app.get("/api/admin/courses/:id/materials", requireAdmin, asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  const course = await getCourseById(courseId, req.user.id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Curso não encontrado."
    });
  }

  const materials = await listCourseMaterials(courseId);
  res.json({
    success: true,
    materials
  });
}));

app.put("/api/admin/courses/:id", requireAdmin, asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  const existingCourse = await getCourseById(courseId, req.user.id);
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const priceCents = Math.round(Number(req.body.price || 0) * 100);

  if (!existingCourse) {
    return res.status(404).json({
      success: false,
      message: "Curso n?o encontrado."
    });
  }

  if (!title) {
    return res.status(400).json({
      success: false,
      message: "Informe o ttulo do curso."
    });
  }

  if (priceCents < 0) {
    return res.status(400).json({
      success: false,
      message: "Informe um pre?o v?lido para o curso."
    });
  }

  const course = await updateCourse(courseId, { title, description, priceCents });

  res.json({
    success: true,
    message: `Curso ${course.title} atualizado com sucesso.`,
    course
  });
}));

app.delete("/api/admin/courses/:id", requireAdmin, asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  const course = await getCourseById(courseId, req.user.id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Curso n?o encontrado."
    });
  }

  await deleteCourse(courseId);
  removeDirIfExists(getCourseDir(courseId));

  res.json({
    success: true,
    message: `Curso ${course.title} excluido com sucesso.`
  });
}));

app.post(
  "/api/admin/courses/:id/lessons",
  requireAdmin,
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "textFile", maxCount: 1 }
  ]),
  asyncHandler(async (req, res) => {
    const courseId = Number(req.params.id);
    const course = await getCourseById(courseId, req.user.id);
    const title = String(req.body.title || "").trim();
    const content = String(req.body.content || "").trim();
    const youtubeUrl = extractYouTubeEmbedUrl(req.body.youtubeUrl);
    const lessons = await listLessonsByCourse(courseId);
    const position = Number(req.body.position || lessons.length + 1);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Curso n?o encontrado."
      });
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Informe o ttulo da aula."
      });
    }

    const files = req.files || {};
    const hasLocalFiles = Boolean(files.pdf?.[0] || files.textFile?.[0]);

    if (hasLocalFiles) {
      ensureLocalUploadsAllowed();
    }

    const lesson = await createLesson({
      courseId,
      title,
      content,
      textFilePath: null,
      videoPath: null,
      youtubeUrl,
      pdfPath: null,
      position
    });

    let pdfPath = null;
    let textFilePath = null;

    if (hasLocalFiles) {
      const lessonDir = ensureCourseLessonDir(courseId, lesson.id);
      pdfPath = writeUploadedFile(lessonDir, files.pdf?.[0], "material.pdf");
      textFilePath = writeUploadedFile(lessonDir, files.textFile?.[0], "material.txt");
    }

    if (youtubeUrl || pdfPath || textFilePath) {
      await updateLessonAssets(lesson.id, {
        youtubeUrl,
        pdfPath,
        textFilePath
      });
    }

    const updatedLesson = await getLessonById(lesson.id);

    res.json({
      success: true,
      message: `Aula ${updatedLesson.title} criada com sucesso.`,
      lesson: updatedLesson
    });
  })
);

app.put("/api/admin/lessons/:id", requireAdmin, asyncHandler(async (req, res) => {
  const lessonId = Number(req.params.id);
  const lesson = await getLessonById(lessonId);
  const title = String(req.body.title || "").trim();
  const content = String(req.body.content || "").trim();
  const position = Number(req.body.position || 1);
  const youtubeUrl = req.body.youtubeUrl !== undefined
    ? extractYouTubeEmbedUrl(req.body.youtubeUrl)
    : undefined;

  if (!lesson) {
    return res.status(404).json({
      success: false,
      message: "Aula n?o encontrada."
    });
  }

  if (!title) {
    return res.status(400).json({
      success: false,
      message: "Informe o ttulo da aula."
    });
  }

  const updatedLesson = await updateLesson(lessonId, {
    title,
    content,
    position
  });

  if (req.body.youtubeUrl !== undefined) {
    await updateLessonAssets(lessonId, {
      youtubeUrl
    });
  }

  const refreshedLesson = await getLessonById(lessonId);

  res.json({
    success: true,
    message: `Aula ${refreshedLesson.title} atualizada com sucesso.`,
    lesson: refreshedLesson
  });
}));

app.post(
  "/api/admin/courses/:id/materials",
  requireAdmin,
  upload.single("materialFile"),
  asyncHandler(async (req, res) => {
    ensureLocalUploadsAllowed();
    const courseId = Number(req.params.id);
    const course = await getCourseById(courseId, req.user.id);
    const title = String(req.body.title || "").trim();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Curso não encontrado."
      });
    }

    if (!title || !req.file) {
      return res.status(400).json({
        success: false,
        message: "Informe o título e envie um arquivo para o material complementar."
      });
    }

    const materialsDir = ensureCourseMaterialsDir(courseId);
    const filePath = writeUploadedFile(materialsDir, req.file, req.file.originalname || "material");
    const material = await createCourseMaterial({
      courseId,
      title,
      filePath
    });

    res.json({
      success: true,
      message: `Material ${material.title} enviado com sucesso.`,
      material
    });
  })
);

app.delete("/api/admin/course-materials/:id", requireAdmin, asyncHandler(async (req, res) => {
  const material = await getCourseMaterialById(Number(req.params.id));

  if (!material) {
    return res.status(404).json({
      success: false,
      message: "Material complementar não encontrado."
    });
  }

  const absolutePath = path.join(__dirname, material.filePath);
  if (fs.existsSync(absolutePath)) {
    fs.rmSync(absolutePath, { force: true });
  }

  await deleteCourseMaterial(material.id);

  res.json({
    success: true,
    message: "Material complementar excluído com sucesso."
  });
}));

app.delete("/api/admin/lessons/:id", requireAdmin, asyncHandler(async (req, res) => {
  const lessonId = Number(req.params.id);
  const lesson = await getLessonById(lessonId);

  if (!lesson) {
    return res.status(404).json({
      success: false,
      message: "Aula n?o encontrada."
    });
  }

  await deleteLesson(lessonId);
  removeDirIfExists(getLessonDir(lesson.courseId, lessonId));

  res.json({
    success: true,
    message: `Aula ${lesson.title} excluida com sucesso.`
  });
}));

app.post("/cadastro", asyncHandler(async (req, res) => {
  const { nome, email, senha } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedName = String(nome || "").trim();
  const plainPassword = String(senha || "");

  if (!normalizedName || !normalizedEmail || !plainPassword) {
    return res.status(400).json({
      success: false,
      message: "Nome, e-mail e senha so obrigatorios."
    });
  }

  if (plainPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "A senha precisa ter pelo menos 6 caracteres."
    });
  }

  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: "Ja existe uma conta cadastrada com este e-mail."
    });
  }

  const passwordHash = await bcrypt.hash(plainPassword, 10);
  let user;
  try {
    user = await createUser({
      nome: normalizedName,
      email: normalizedEmail,
      passwordHash
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT") {
      return res.status(409).json({
        success: false,
        message: "Ja existe uma conta cadastrada com este e-mail."
      });
    }

    throw error;
  }

  const token = createToken(user);
  setAuthCookie(res, token);

  res.json({
    success: true,
    message: `Cadastro concluido. Bem-vindo, ${user.nome}.`,
    user: sanitizeUser(user)
  });
}));

app.post("/login", asyncHandler(async (req, res) => {
  const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
  const plainPassword = String(req.body.senha || "");

  if (!normalizedEmail || !plainPassword) {
    return res.status(400).json({
      success: false,
      message: "Informe e-mail e senha."
    });
  }

  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "E-mail ou senha invlidos."
    });
  }

  const passwordMatches = await bcrypt.compare(plainPassword, user.passwordHash);

  if (!passwordMatches) {
    return res.status(401).json({
      success: false,
      message: "E-mail ou senha invlidos."
    });
  }

  const token = createToken(user);
  setAuthCookie(res, token);

  res.json({
    success: true,
    message: `Login realizado com sucesso. Bem-vindo de volta, ${user.nome}.`,
    user: sanitizeUser(user)
  });
}));

app.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({
    success: true,
    message: "Sess?o encerrada com sucesso."
  });
});

app.use((error, req, res, next) => {
  console.error("Erro no servidor:", error);

  res.status(error.status || 500).json({
    success: false,
    message: error.status ? error.message : "Ocorreu um erro interno no servidor."
  });
});

initDatabase()
  .then(() => {
    validateProductionConfig(appConfig);

    if (!isMailerConfigured()) {
      console.log("SMTP não configurado. Os e-mails automáticos ficarão desativados até configurar as variáveis de ambiente.");
    }

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao inicializar o banco de dados:", error);
    process.exit(1);
  });


