async function handleFormSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const formType = form.dataset.formType;
  const messageElement = form.querySelector(".form-message");
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  messageElement.textContent = "Enviando...";

  try {
    const response = await fetch(`/${formType}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      messageElement.textContent = result.message || "Não foi possível concluir a operação.";
      return;
    }

    messageElement.textContent = result.message || "Operação realizada com sucesso.";
    form.reset();

    if (formType === "login" || formType === "cadastro") {
      window.setTimeout(() => {
        window.location.href = "/";
      }, 900);
    }
  } catch (error) {
    messageElement.textContent = "Não foi possível enviar os dados. Tente novamente.";
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    result = null;
  }

  return { response, result };
}

const COURSE_BUNDLE_STORAGE_KEY = "enfaflix:selectedCourses";

function formatCurrency(valueInCents) {
  return (Number(valueInCents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function getSelectedCourseIds() {
  try {
    const rawValue = window.localStorage.getItem(COURSE_BUNDLE_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    return JSON.parse(rawValue)
      .map((value) => Number(value))
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

function setSelectedCourseIds(courseIds) {
  window.localStorage.setItem(
    COURSE_BUNDLE_STORAGE_KEY,
    JSON.stringify(Array.from(new Set(courseIds.map((value) => Number(value)).filter(Boolean))))
  );
}

function toggleSelectedCourseId(courseId) {
  const normalizedId = Number(courseId);
  const currentIds = getSelectedCourseIds();

  if (currentIds.includes(normalizedId)) {
    const nextIds = currentIds.filter((value) => value !== normalizedId);
    setSelectedCourseIds(nextIds);
    return nextIds;
  }

  const nextIds = [...currentIds, normalizedId];
  setSelectedCourseIds(nextIds);
  return nextIds;
}

function getCheckoutCourseIdsFromLocation() {
  const searchParams = new URLSearchParams(window.location.search);
  const idsFromQuery = String(searchParams.get("ids") || "")
    .split(",")
    .map((value) => Number(value))
    .filter(Boolean);

  if (idsFromQuery.length > 0) {
    return Array.from(new Set(idsFromQuery));
  }

  const lastSegment = window.location.pathname.split("/").pop();
  const courseId = Number(lastSegment);

  return courseId ? [courseId] : [];
}

function getPrimaryNavigationItems() {
  return [
    { href: "/#inicio", label: "Início" },
    { href: "/#historia", label: "História" },
    { href: "/#diferenciais", label: "Diferenciais" },
    { href: "/#beneficios", label: "Benefícios" },
    { href: "/#comunidade", label: "Comunidade" },
    { href: "/cursos", label: "Cursos" },
    { href: "/dashboard", label: "Dashboard" }
  ];
}

function isNavLinkActive(href, currentPage) {
  if (href === "/cursos") {
    return currentPage === "courses";
  }

  if (href === "/dashboard") {
    return currentPage === "dashboard";
  }

  if (href === "/gestao") {
    return currentPage === "admin";
  }

  if (href.startsWith("/#")) {
    const anchor = href.replace("/", "");
    if (currentPage !== "home") {
      return false;
    }

    if (!window.location.hash && anchor === "#inicio") {
      return true;
    }

    return window.location.hash === anchor;
  }

  if (href === "/login") {
    return currentPage === "login";
  }

  if (href === "/cadastro") {
    return currentPage === "cadastro";
  }

  return window.location.pathname === href;
}

function renderSiteNavigation(user = null) {
  const navigation = document.querySelector("[data-site-nav]");

  if (!navigation) {
    return;
  }

  const currentPage = document.body.dataset.page || "";
  const primaryLinks = getPrimaryNavigationItems()
    .map((item) => `
      <a href="${item.href}" class="${isNavLinkActive(item.href, currentPage) ? "active" : ""}">
        ${item.label}
      </a>
    `)
    .join("");

  const managementLink = user?.isAdmin
    ? `<a href="/gestao" class="${isNavLinkActive("/gestao", currentPage) ? "active" : ""}">Gestão</a>`
    : "";

  const authLinks = user
    ? `
      <span class="nav-user">Olá, ${user.nome.split(" ")[0]}</span>
      <button type="button" class="nav-logout" data-nav-logout>Sair</button>
    `
    : `
      <a href="/login" class="${isNavLinkActive("/login", currentPage) ? "active" : ""}">Login</a>
      <a href="/cadastro" class="${isNavLinkActive("/cadastro", currentPage) ? "active" : ""}">Cadastro</a>
    `;

  navigation.innerHTML = `
    ${primaryLinks}
    ${managementLink}
    ${authLinks}
  `;

  const navLogoutButton = navigation.querySelector("[data-nav-logout]");
  if (navLogoutButton) {
    navLogoutButton.addEventListener("click", async () => {
      const response = await fetch("/logout", {
        method: "POST",
        credentials: "same-origin"
      });

      if (response.ok) {
        window.location.href = "/";
      }
    });
  }
}

async function loadSession() {
  const panel = document.querySelector("#session-panel");
  const message = document.querySelector("#session-message");
  const logoutButton = document.querySelector("#logout-button");
  let currentUser = null;

  try {
    const { response, result } = await fetchJson("/api/session");

    if (response.ok && result.user) {
      currentUser = result.user;
    }
  } catch (error) {
    currentUser = null;
  }

  renderSiteNavigation(currentUser);

  if (!panel || !message || !logoutButton) {
    return;
  }

  if (!currentUser) {
    panel.classList.add("hidden");
    return;
  }

  try {
    message.textContent = `Logado como ${currentUser.nome} (${currentUser.email}).`;
    panel.classList.remove("hidden");

    logoutButton.addEventListener("click", async () => {
      const response = await fetch("/logout", {
        method: "POST",
        credentials: "same-origin"
      });

      if (response.ok) {
        window.location.reload();
      }
    });
  } catch (error) {
    if (panel) {
      panel.classList.add("hidden");
    }
  }
}

function createCourseCard(course, currentUser) {
  const selectedCourseIds = getSelectedCourseIds();
  const isSelected = selectedCourseIds.includes(course.id);
  const primaryAction = course.enrolled
    ? `<a class="button primary" href="/aula/${course.firstLessonId}">Abrir curso</a>`
    : `<a class="button primary" href="${currentUser ? `/comprar/${course.id}` : "/login"}">${currentUser ? "Comprar acesso" : "Entrar para comprar"}</a>`;

  const secondaryAction = `<button class="button secondary" type="button" data-preview-course="${course.id}">Ver aulas</button>`;
  const bundleAction = !course.enrolled && currentUser
    ? `<button class="button ${isSelected ? "primary" : "secondary"}" type="button" data-toggle-course="${course.id}">${isSelected ? "Remover do combo" : "Adicionar ao combo"}</button>`
    : "";
  const bundleBadge = !course.enrolled
    ? `<p class="course-highlight">Leve 2 ou mais cursos e ganhe 10% de desconto automático.</p>`
    : "";

  return `
    <article class="course-card">
      <span class="course-meta">${course.lessonsCount} aulas</span>
      <h3>${course.title}</h3>
      <p>${course.description}</p>
      <p class="course-meta">${formatCurrency(course.priceCents || 0)}</p>
      ${bundleBadge}
      <div class="course-actions">
        ${primaryAction}
        ${secondaryAction}
        ${bundleAction}
      </div>
    </article>
  `;
}

async function loadCoursesPage() {
  const list = document.querySelector("#courses-list");
  const promotionsList = document.querySelector("#promotions-list");
  const selectedCount = document.querySelector("#bundle-selected-count");
  const subtotal = document.querySelector("#bundle-subtotal");
  const total = document.querySelector("#bundle-total");
  const summary = document.querySelector("#bundle-summary");
  const checkoutButton = document.querySelector("#bundle-checkout-button");

  if (!list) {
    return;
  }

  const renderCoursePage = async () => {
    const { response, result } = await fetchJson("/api/courses");

    if (!response.ok || !result) {
      list.innerHTML = "<p class='empty-state'>Não foi possível carregar os cursos agora.</p>";
      return;
    }

    list.innerHTML = result.courses.map((course) => createCourseCard(course, result.user)).join("");

    if (promotionsList) {
      const promotionsResult = await fetchJson("/api/promotions");
      if (promotionsResult.response.ok && promotionsResult.result) {
        promotionsList.innerHTML = promotionsResult.result.promotions.length > 0
          ? promotionsResult.result.promotions.map((promotion) => `
            <article class="course-card">
              <span class="course-meta">${promotion.code}</span>
              <h3>${promotion.title || promotion.code}</h3>
              <p>${promotion.description || "Promoção especial ativa no portal."}</p>
              <p><strong>De:</strong> ${formatCurrency(promotion.normalPriceCents || 0)}</p>
              <p><strong>Por:</strong> ${formatCurrency(promotion.discountedPriceCents || 0)}</p>
              <p><strong>Cursos:</strong> ${promotion.courses.length > 0 ? promotion.courses.map((course) => course.title).join(", ") : "Consulte os cursos elegíveis no checkout"}</p>
              ${promotion.expiresAt ? `<p><strong>Validade:</strong> ${new Date(promotion.expiresAt).toLocaleString("pt-BR")}</p>` : ""}
              ${promotion.remainingRedemptions !== null ? `<p><strong>Restantes:</strong> ${promotion.remainingRedemptions} aluno(s)</p>` : ""}
            </article>
          `).join("")
          : "<p class='empty-state'>Nenhuma avalia\u00e7\u00e3o enviada ainda.</p>";
      }
    }

    const selectedCourseIds = getSelectedCourseIds();
    const selectedCourses = result.courses.filter((course) => selectedCourseIds.includes(course.id) && !course.enrolled);
    const subtotalValue = selectedCourses.reduce((accumulator, course) => accumulator + (course.priceCents || 0), 0);
    const totalValue = selectedCourses.length >= 2 ? Math.round(subtotalValue * 0.9) : subtotalValue;

    if (selectedCount) {
      selectedCount.textContent = String(selectedCourses.length);
    }

    if (subtotal) {
      subtotal.textContent = formatCurrency(subtotalValue);
    }

    if (total) {
      total.textContent = formatCurrency(totalValue);
    }

    if (summary) {
      summary.textContent = selectedCourses.length >= 2
        ? "Seu combo já recebe 10% de desconto automático no checkout. Você ainda pode aplicar um cupom promocional."
        : "Selecione 2 ou mais cursos para ganhar 10% de desconto automático no pedido.";
    }

    if (checkoutButton) {
      checkoutButton.disabled = !result.user || selectedCourses.length === 0;
      checkoutButton.textContent = result.user
        ? "Ir para checkout do combo"
        : "Entre para montar seu combo";
      checkoutButton.onclick = () => {
        if (!result.user) {
          window.location.href = "/login";
          return;
        }

        if (selectedCourses.length === 0) {
          window.alert("Selecione pelo menos um curso para continuar.");
          return;
        }

        window.location.href = `/comprar?ids=${selectedCourses.map((course) => course.id).join(",")}`;
      };
    }

    list.querySelectorAll("[data-preview-course]").forEach((button) => {
      button.addEventListener("click", async () => {
        const courseId = button.dataset.previewCourse;
        const details = await fetchJson(`/api/courses/${courseId}`);

        if (!details.response.ok || !details.result) {
          return;
        }

        const lessons = details.result.lessons
          .map((lesson) => `${lesson.position}. ${lesson.title}${lesson.locked ? " (bloqueada)" : ""}`)
          .join("\n");

        window.alert(`${details.result.course.title}\n\n${lessons}`);
      });
    });

    list.querySelectorAll("[data-toggle-course]").forEach((button) => {
      button.addEventListener("click", () => {
        toggleSelectedCourseId(button.dataset.toggleCourse);
        renderCoursePage();
      });
    });
  };

  await renderCoursePage();
}

async function loadDashboardPage() {
  const title = document.querySelector("#dashboard-title");
  const subtitle = document.querySelector("#dashboard-subtitle");
  const count = document.querySelector("#dashboard-count");
  const grid = document.querySelector("#dashboard-courses");
  const empty = document.querySelector("#dashboard-empty");
  const logoutButton = document.querySelector("#logout-button");
  const ordersGrid = document.querySelector("#dashboard-orders");
  const completedCount = document.querySelector("#dashboard-completed-count");

  if (!title || !subtitle || !count || !grid || !empty) {
    return;
  }

  const { response, result } = await fetchJson("/api/dashboard");

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  if (!response.ok || !result) {
    title.textContent = "Não foi possível carregar seu dashboard.";
    subtitle.textContent = "Tente novamente em alguns instantes.";
    return;
  }

  title.textContent = `Bem-vindo, ${result.user.nome}.`;
  subtitle.textContent = "Acesse seus cursos comprados e continue de onde parou.";
  count.textContent = String(result.stats.enrolledCourses);
  if (completedCount) {
    completedCount.textContent = String(result.stats.completedCourses || 0);
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      const logout = await fetch("/logout", {
        method: "POST",
        credentials: "same-origin"
      });

      if (logout.ok) {
        window.location.href = "/";
      }
    });
  }

  if (result.courses.length === 0) {
    empty.classList.remove("hidden");
    grid.innerHTML = "";
    return;
  }

  empty.classList.add("hidden");
  grid.innerHTML = result.courses.map((courseItem) => `
    <article class="course-card">
      <span class="course-meta">${courseItem.lessonsCount} aulas liberadas</span>
      <h3>${courseItem.title}</h3>
      <p>${courseItem.description}</p>
      <p>Progresso: ${courseItem.progress.completedLessons}/${courseItem.progress.totalLessons} (${courseItem.progress.percent}%)</p>
      <p>Materiais complementares: ${courseItem.materialsCount || 0}</p>
      ${courseItem.progress.completed && !courseItem.evaluationSubmitted ? "<p>Falta enviar a avaliação final para liberar o certificado.</p>" : ""}
      <div class="course-actions">
        <a class="button primary" href="/aula/${courseItem.firstLessonId}">Continuar</a>
        ${courseItem.certificate ? `<a class="button secondary" href="/certificado/${courseItem.id}">Certificado</a>` : `<a class="button secondary" href="/cursos">Ver catálogo</a>`}
      </div>
    </article>
  `).join("");

  if (ordersGrid) {
    const ordersResult = await fetchJson("/api/orders");
    if (ordersResult.response.ok && ordersResult.result) {
      ordersGrid.innerHTML = ordersResult.result.orders.length > 0
        ? ordersResult.result.orders.map((order) => `
          <article class="course-card">
            <span class="course-meta">${order.status === "approved" ? "Aprovado" : "Pendente"}</span>
            <h3>${order.courseTitle}</h3>
            <p>Referência: ${order.reference}</p>
            ${order.groupReference ? `<p>Pedido em grupo: ${order.groupReference}</p>` : ""}
            <p>Valor final: ${formatCurrency(order.amountCents || 0)}</p>
            ${order.discountCents ? `<p>Desconto aplicado: ${formatCurrency(order.discountCents)}</p>` : ""}
          </article>
        `).join("")
        : "<p class='empty-state'>Você ainda não gerou nenhum pedido.</p>";
    }
  }
}

async function loadLessonPage() {
  const title = document.querySelector("#lesson-title");
  const course = document.querySelector("#lesson-course");
  const lockPanel = document.querySelector("#lesson-lock");
  const lockMessage = document.querySelector("#lesson-lock-message");
  const lockLink = document.querySelector("#lesson-lock-link");
  const contentPanel = document.querySelector("#lesson-content-panel");
  const content = document.querySelector("#lesson-content");
  const navigation = document.querySelector("#lesson-navigation");
  const videoWrapper = document.querySelector("#lesson-video-wrapper");
  const video = document.querySelector("#lesson-video");
  const assets = document.querySelector("#lesson-assets");
  const pdfLink = document.querySelector("#lesson-pdf-link");
  const textLink = document.querySelector("#lesson-text-link");
  const courseMaterialsPanel = document.querySelector("#course-materials-panel");
  const courseMaterialsList = document.querySelector("#course-materials-list");
  const completeButton = document.querySelector("#complete-lesson-button");
  const progressMessage = document.querySelector("#lesson-progress-message");
  const evaluationPanel = document.querySelector("#evaluation-panel");
  const evaluationForm = document.querySelector("#evaluation-form");
  const evaluationMessage = document.querySelector("#evaluation-message");
  const certificateLink = document.querySelector("#certificate-link");

  if (!title || !course || !lockPanel || !lockMessage || !lockLink || !contentPanel || !content || !navigation) {
    return;
  }

  const lessonId = window.location.pathname.split("/").pop();
  const { response, result } = await fetchJson(`/api/lessons/${lessonId}`);

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  if (response.status === 403 && result) {
    title.textContent = "Acesso restrito";
    course.textContent = "Esta aula faz parte de um conteúdo premium.";
    lockPanel.classList.remove("hidden");
    lockMessage.textContent = result.message;
    lockLink.href = "/cursos";
    return;
  }

  if (!response.ok || !result) {
    title.textContent = "Aula indisponível";
    course.textContent = "Não foi possível carregar este conteúdo.";
    return;
  }

  title.textContent = result.lesson.title;
  course.textContent = `${result.lesson.courseTitle} - Aula ${result.lesson.position}`;
  content.textContent = result.lesson.content;
  contentPanel.classList.remove("hidden");

  if (videoWrapper && video && (result.assets.youtubeEmbedUrl || result.assets.videoUrl)) {
    video.src = result.assets.youtubeEmbedUrl || result.assets.videoUrl;
    videoWrapper.classList.remove("hidden");
  }

  if (assets && pdfLink && result.assets.pdfUrl) {
    pdfLink.href = result.assets.pdfUrl;
    pdfLink.classList.remove("hidden");
    assets.classList.remove("hidden");
  }

  if (assets && textLink && result.assets.textDownloadUrl) {
    textLink.href = result.assets.textDownloadUrl;
    textLink.classList.remove("hidden");
    assets.classList.remove("hidden");
  }

  navigation.innerHTML = result.navigation.map((item) => `
    <a href="/aula/${item.id}" class="${item.id === Number(lessonId) ? "active" : ""}">
      Aula ${item.position}: ${item.title}${item.completed ? " - concluída" : ""}
    </a>
  `).join("");

  if (courseMaterialsPanel && courseMaterialsList && Array.isArray(result.materials)) {
    if (result.materials.length > 0) {
      courseMaterialsList.innerHTML = result.materials.map((material) => `
        <a href="/api/course-materials/${material.id}/download" target="_blank" rel="noreferrer">
          ${material.title}
        </a>
      `).join("");
      courseMaterialsPanel.classList.remove("hidden");
    } else {
      courseMaterialsPanel.classList.add("hidden");
    }
  }

  if (completeButton && progressMessage) {
    completeButton.addEventListener("click", async () => {
      completeButton.disabled = true;
      progressMessage.textContent = "Salvando concluso...";

      const completeResult = await fetchJson(`/api/lessons/${lessonId}/complete`, {
        method: "POST"
      });

      completeButton.disabled = false;

      if (!completeResult.response.ok || !completeResult.result) {
        progressMessage.textContent = completeResult.result.message || "Não foi possível concluir a aula.";
        return;
      }

      progressMessage.textContent = `${completeResult.result.message} Progresso: ${completeResult.result.progress.completedLessons}/${completeResult.result.progress.totalLessons}.`;

      if (completeResult.result.certificate && certificateLink) {
        certificateLink.href = `/certificado/${result.lesson.courseId}`;
        certificateLink.classList.remove("hidden");
      }

      if (completeResult.result.progress.completed && evaluationPanel) {
        evaluationPanel.classList.remove("hidden");
      }
    });
  }

  if (result.progress.completed && evaluationPanel) {
    evaluationPanel.classList.remove("hidden");
  }

  if (result.certificate && certificateLink) {
    certificateLink.href = `/certificado/${result.lesson.courseId}`;
    certificateLink.classList.remove("hidden");
  }

  if (result.evaluation && evaluationMessage) {
    evaluationMessage.textContent = "Avalia\u00e7\u00e3o do curso j\u00e1 enviada. Voc\u00ea pode atualizar sua resposta.";
  }

  if (evaluationForm && evaluationMessage) {
    evaluationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      evaluationMessage.textContent = "Enviando avalia\u00e7\u00e3o do curso...";

      const formData = new FormData(evaluationForm);
      const payload = {
        rating: Number(formData.get("rating")),
        comment: formData.get("comment"),
        answers: {
          learning: formData.get("learning"),
          improve: formData.get("improve")
        }
      };

      const evaluationResult = await fetchJson(`/api/courses/${result.lesson.courseId}/evaluation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!evaluationResult.response.ok || !evaluationResult.result) {
        evaluationMessage.textContent = evaluationResult.result.message || "N\u00e3o foi poss\u00edvel enviar a avalia\u00e7\u00e3o do curso.";
        return;
      }

      evaluationMessage.textContent = evaluationResult.result.message;
      if (evaluationResult.result.certificate && certificateLink) {
        certificateLink.href = `/certificado/${result.lesson.courseId}`;
        certificateLink.classList.remove("hidden");
      }
    });
  }
}

async function loadAdminPage() {
  const courseForm = document.querySelector("#course-form");
  const lessonForm = document.querySelector("#lesson-form");
  const courseMessage = document.querySelector("#course-form-message");
  const lessonMessage = document.querySelector("#lesson-form-message");
  const courseSelect = document.querySelector("#lesson-course");
  const releaseForm = document.querySelector("#release-form");
  const releaseMessage = document.querySelector("#release-form-message");
  const releaseCourseSelect = document.querySelector("#release-course");
  const certificateReleaseForm = document.querySelector("#certificate-release-form");
  const certificateReleaseMessage = document.querySelector("#certificate-release-message");
  const certificateReleaseCourseSelect = document.querySelector("#certificate-release-course");
  const list = document.querySelector("#admin-courses-list");
  const ordersList = document.querySelector("#admin-orders-list");
  const statsGrid = document.querySelector("#admin-stats");
  const courseStatsList = document.querySelector("#admin-course-stats");
  const evaluationsList = document.querySelector("#admin-evaluations-list");
  const materialForm = document.querySelector("#material-form");
  const materialMessage = document.querySelector("#material-form-message");
  const materialCourseSelect = document.querySelector("#material-course");
  const materialsList = document.querySelector("#admin-materials-list");
  const promoForm = document.querySelector("#promo-form");
  const promoMessage = document.querySelector("#promo-form-message");
  const promoCodesList = document.querySelector("#admin-promo-codes-list");
  const promoCourseOptions = document.querySelector("#promo-course-options");

  if (!courseForm || !lessonForm || !courseMessage || !lessonMessage || !courseSelect || !list || !releaseForm || !releaseMessage || !releaseCourseSelect || !certificateReleaseForm || !certificateReleaseMessage || !certificateReleaseCourseSelect || !ordersList || !statsGrid || !courseStatsList || !evaluationsList || !materialForm || !materialMessage || !materialCourseSelect || !materialsList || !promoForm || !promoMessage || !promoCodesList || !promoCourseOptions) {
    return;
  }

  const fillCourses = async () => {
    const { response, result } = await fetchJson("/api/courses");

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (response.status === 403) {
      window.location.href = "/";
      return;
    }

    if (!response.ok || !result) {
      list.innerHTML = "<p class='empty-state'>Não foi possível carregar os cursos locais.</p>";
      return;
    }

    const courseTitleById = new Map(result.courses.map((course) => [course.id, course.title]));

    courseSelect.innerHTML = result.courses
      .map((course) => `<option value="${course.id}">${course.title}</option>`)
      .join("");
    releaseCourseSelect.innerHTML = result.courses
      .map((course) => `<option value="${course.id}">${course.title}</option>`)
      .join("");
    certificateReleaseCourseSelect.innerHTML = result.courses
      .map((course) => `<option value="${course.id}">${course.title}</option>`)
      .join("");
    materialCourseSelect.innerHTML = result.courses
      .map((course) => `<option value="${course.id}">${course.title}</option>`)
      .join("");
    promoCourseOptions.innerHTML = result.courses
      .map((course) => `
        <label class="checkbox-option">
          <input type="checkbox" name="eligibleCourseIds" value="${course.id}" />
          <span>${course.title}</span>
        </label>
      `)
      .join("");

    const detailResults = await Promise.all(
      result.courses.map((course) => fetchJson(`/api/courses/${course.id}`))
    );
    const materialResults = await Promise.all(
      result.courses.map((course) => fetchJson(`/api/admin/courses/${course.id}/materials`))
    );

    list.innerHTML = result.courses.map((course, index) => {
      const detail = detailResults[index].result;
      const lessons = detail.lessons || [];

      return `
      <article class="course-card">
        <span class="course-meta">${course.lessonsCount} aulas</span>
        <h3>${course.title}</h3>
        <p>${course.description || "Curso sem descrição."}</p>
        <p>${((course.priceCents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
        <div class="course-actions">
          <button class="button secondary" type="button" data-edit-course="${course.id}" data-course-title="${encodeURIComponent(course.title)}" data-course-description="${encodeURIComponent(course.description || "")}" data-course-price="${((course.priceCents || 0) / 100).toFixed(2)}">Editar curso</button>
          <button class="button danger" type="button" data-delete-course="${course.id}" data-course-name="${encodeURIComponent(course.title)}">Excluir curso</button>
        </div>
        <div class="admin-course-lessons">
          ${lessons.length > 0 ? lessons.map((lesson) => `
            <div class="admin-lesson-item">
              <strong>Aula ${lesson.position}: ${lesson.title}</strong>
              <div class="admin-lesson-meta">
                ${lesson.youtubeUrl ? "YouTube" : lesson.hasVideo ? "Vídeo local" : "Sem vídeo"} ?
                ${lesson.hasPdf ? "PDF" : "Sem PDF"} ?
                ${lesson.hasTextFile ? "Texto" : "Sem arquivo de texto"}
              </div>
              <div class="course-actions">
                <button class="button secondary" type="button" data-edit-lesson="${lesson.id}" data-lesson-title="${encodeURIComponent(lesson.title)}" data-lesson-position="${lesson.position}">Editar aula</button>
                <button class="button danger" type="button" data-delete-lesson="${lesson.id}" data-lesson-name="${encodeURIComponent(lesson.title)}">Excluir aula</button>
              </div>
            </div>
          `).join("") : "<p class='empty-state'>Nenhuma aula cadastrada ainda.</p>"}
        </div>
      </article>
    `;
    }).join("");

    materialsList.innerHTML = result.courses.flatMap((course, index) => {
      const materials = materialResults[index].result.materials || [];
      return materials.map((material) => `
        <article class="course-card">
          <span class="course-meta">${course.title}</span>
          <h3>${material.title}</h3>
          <div class="course-actions">
            <a class="button secondary" href="/api/course-materials/${material.id}/download" target="_blank" rel="noreferrer">Abrir material</a>
            <button class="button danger" type="button" data-delete-material="${material.id}">Excluir material</button>
          </div>
        </article>
      `);
    }).join("") || "<p class='empty-state'>Nenhum material complementar cadastrado ainda.</p>";

    list.querySelectorAll("[data-edit-course]").forEach((button) => {
      button.addEventListener("click", async () => {
        const courseId = button.dataset.editCourse;
        const currentTitle = decodeURIComponent(button.dataset.courseTitle || "");
        const currentDescription = decodeURIComponent(button.dataset.courseDescription || "");
        const currentPrice = button.dataset.coursePrice || "0.00";
        const newTitle = window.prompt("Novo ttulo do curso:", currentTitle);

        if (newTitle === null) {
          return;
        }

        const newDescription = window.prompt("Nova descrição do curso:", currentDescription);
        const newPrice = window.prompt("Novo preço do curso (R$):", currentPrice);

        const update = await fetchJson(`/api/admin/courses/${courseId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title: newTitle,
            description: newDescription === null ? currentDescription : newDescription,
            price: newPrice === null ? currentPrice : newPrice
          })
        });

        if (!update.response.ok) {
          courseMessage.textContent = update.result.message || "Não foi possível atualizar o curso.";
          return;
        }

        courseMessage.textContent = update.result.message;
        await fillCourses();
      });
    });

    list.querySelectorAll("[data-delete-course]").forEach((button) => {
      button.addEventListener("click", async () => {
        const courseId = button.dataset.deleteCourse;
        const courseName = decodeURIComponent(button.dataset.courseName || "este curso");
        const confirmed = window.confirm(`Excluir o curso "${courseName}" e todas as aulas`);

        if (!confirmed) {
          return;
        }

        const deletion = await fetchJson(`/api/admin/courses/${courseId}`, {
          method: "DELETE"
        });

        if (!deletion.response.ok) {
          courseMessage.textContent = deletion.result.message || "Não foi possível excluir o curso.";
          return;
        }

        courseMessage.textContent = deletion.result.message;
        await fillCourses();
      });
    });

    list.querySelectorAll("[data-edit-lesson]").forEach((button) => {
      button.addEventListener("click", async () => {
        const lessonId = button.dataset.editLesson;
        const currentTitle = decodeURIComponent(button.dataset.lessonTitle || "");
        const currentPosition = button.dataset.lessonPosition || "1";
        const newTitle = window.prompt("Novo ttulo da aula:", currentTitle);

        if (newTitle === null) {
          return;
        }

        const newPosition = window.prompt("Nova posio da aula:", currentPosition);
        const lessonData = await fetchJson(`/api/admin/lessons/${lessonId}`);
        const currentContent = lessonData.result.lesson.content || "";
        const currentYoutubeUrl = lessonData.result.lesson.youtubeUrl || "";
        const newContent = window.prompt("Novo texto da aula:", currentContent);
        const newYoutubeUrl = window.prompt("Novo link do YouTube da aula:", currentYoutubeUrl);

        const update = await fetchJson(`/api/admin/lessons/${lessonId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title: newTitle,
            position: newPosition || currentPosition,
            content: newContent === null ? currentContent : newContent,
            youtubeUrl: newYoutubeUrl === null ? currentYoutubeUrl : newYoutubeUrl
          })
        });

        if (!update.response.ok) {
          lessonMessage.textContent = update.result.message || "Não foi possível atualizar a aula.";
          return;
        }

        lessonMessage.textContent = update.result.message;
        await fillCourses();
      });
    });

    list.querySelectorAll("[data-delete-lesson]").forEach((button) => {
      button.addEventListener("click", async () => {
        const lessonId = button.dataset.deleteLesson;
        const lessonName = decodeURIComponent(button.dataset.lessonName || "esta aula");
        const confirmed = window.confirm(`Excluir a aula "${lessonName}"`);

        if (!confirmed) {
          return;
        }

        const deletion = await fetchJson(`/api/admin/lessons/${lessonId}`, {
          method: "DELETE"
        });

        if (!deletion.response.ok) {
          lessonMessage.textContent = deletion.result.message || "Não foi possível excluir a aula.";
          return;
        }

        lessonMessage.textContent = deletion.result.message;
        await fillCourses();
      });
    });

    materialsList.querySelectorAll("[data-delete-material]").forEach((button) => {
      button.addEventListener("click", async () => {
        const confirmed = window.confirm("Excluir este material complementar");

        if (!confirmed) {
          return;
        }

        const deletion = await fetchJson(`/api/admin/course-materials/${button.dataset.deleteMaterial}`, {
          method: "DELETE"
        });

        if (!deletion.response.ok) {
          materialMessage.textContent = deletion.result.message || "Não foi possível excluir o material.";
          return;
        }

        materialMessage.textContent = deletion.result.message;
        await fillCourses();
      });
    });

    const pendingOrders = await fetchJson("/api/orders/pending");
    if (pendingOrders.response.ok && pendingOrders.result) {
      ordersList.innerHTML = pendingOrders.result.orders.length > 0
        ? pendingOrders.result.orders.map((order) => `
          <article class="course-card">
            <span class="course-meta">Pendente</span>
            <h3>${order.courseTitle}</h3>
            <p>Aluno: ${order.userName} (${order.userEmail})</p>
            <p>Referência: ${order.reference}</p>
            ${order.groupReference ? `<p>Grupo: ${order.groupReference}</p>` : ""}
            <p>Valor final: ${formatCurrency(order.amountCents || 0)}</p>
            ${order.originalAmountCents ? `<p>Valor original: ${formatCurrency(order.originalAmountCents)}</p>` : ""}
            ${order.discountCents ? `<p>Desconto: ${formatCurrency(order.discountCents)}</p>` : ""}
            ${order.promoCode ? `<p>Cupom: ${order.promoCode}</p>` : ""}
            <div class="course-actions">
              <button class="button primary" type="button" data-approve-order="${order.id}">Aprovar e liberar</button>
            </div>
          </article>
        `).join("")
        : "<p class='empty-state'>Nenhum pedido pendente no momento.</p>";

      ordersList.querySelectorAll("[data-approve-order]").forEach((button) => {
        button.addEventListener("click", async () => {
          const orderId = button.dataset.approveOrder;
          const paymentNote = window.prompt("Observação opcional do pagamento:", "") || "";
          const approval = await fetchJson(`/api/admin/orders/${orderId}/approve`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ paymentNote })
          });

          if (!approval.response.ok) {
            releaseMessage.textContent = approval.result.message || "Não foi possível aprovar o pedido.";
            return;
          }

          releaseMessage.textContent = approval.result.message;
          await fillCourses();
        });
      });
    }

    const adminStats = await fetchJson("/api/admin/stats");
    if (adminStats.response.ok && adminStats.result) {
      statsGrid.innerHTML = `
        <article class="dashboard-stat">
          <span>Alunos no total</span>
          <strong>${adminStats.result.stats.totals.totalStudents}</strong>
        </article>
        <article class="dashboard-stat">
          <span>Matrículas</span>
          <strong>${adminStats.result.stats.totals.totalEnrollments}</strong>
        </article>
        <article class="dashboard-stat">
          <span>Certificados</span>
          <strong>${adminStats.result.stats.totals.totalCertificates}</strong>
        </article>
      `;

      courseStatsList.innerHTML = adminStats.result.stats.courses.length > 0
        ? adminStats.result.stats.courses.map((courseStats) => `
          <article class="course-card">
            <span class="course-meta">Curso #${courseStats.id}</span>
            <h3>${courseStats.title}</h3>
            <p><strong>Alunos matriculados:</strong> ${courseStats.enrolledStudents}</p>
            <p><strong>Certificados emitidos:</strong> ${courseStats.certifiedStudents}</p>
            <p><strong>Média das avaliações:</strong> ${courseStats.averageRating || "Sem notas ainda"}</p>
          </article>
        `).join("")
        : "<p class='empty-state'>Nenhum curso cadastrado ainda.</p>";
    }

    const promoCodes = await fetchJson("/api/admin/promo-codes");
    if (promoCodes.response.ok && promoCodes.result) {
      promoCodesList.innerHTML = promoCodes.result.promoCodes.length > 0
        ? promoCodes.result.promoCodes.map((promoCode) => `
          <article class="course-card">
            <span class="course-meta">${promoCode.discountType === "percent" ? "Percentual" : "Valor fixo"}</span>
            <h3>${promoCode.title || promoCode.code}</h3>
            <p><strong>Código:</strong> ${promoCode.code}</p>
            ${promoCode.description ? `<p>${promoCode.description}</p>` : ""}
            <p><strong>Desconto:</strong> ${promoCode.discountType === "percent" ? `${promoCode.discountValue}%` : formatCurrency(promoCode.discountValue)}</p>
            <p><strong>Mínimo de cursos:</strong> ${promoCode.minCourses || 1}</p>
            <p><strong>Cursos casados:</strong> ${promoCode.eligibleCourseIds.length ? promoCode.eligibleCourseIds.map((courseId) => courseTitleById.get(courseId) || `Curso ${courseId}`).join(", ") : "Todos os cursos"}</p>
            <p><strong>Limite de alunos:</strong> ${promoCode.maxRedemptions ? `${promoCode.redemptionsCount || 0}/${promoCode.maxRedemptions}` : "Sem limite"}</p>
            <p><strong>Validade:</strong> ${promoCode.expiresAt ? new Date(promoCode.expiresAt).toLocaleString("pt-BR") : "Sem data limite"}</p>
            <div class="course-actions">
              <button class="button danger" type="button" data-delete-promo="${promoCode.id}">Excluir código</button>
            </div>
          </article>
        `).join("")
        : "<p class='empty-state'>Nenhum código promocional criado ainda.</p>";

      promoCodesList.querySelectorAll("[data-delete-promo]").forEach((button) => {
        button.addEventListener("click", async () => {
          const confirmed = window.confirm("Excluir este código promocional");
          if (!confirmed) {
            return;
          }

          const deletion = await fetchJson(`/api/admin/promo-codes/${button.dataset.deletePromo}`, {
            method: "DELETE"
          });

          if (!deletion.response.ok) {
            promoMessage.textContent = deletion.result.message || "Não foi possível excluir o código.";
            return;
          }

          promoMessage.textContent = deletion.result.message;
          await fillCourses();
        });
      });
    }

    const evaluations = await fetchJson("/api/admin/evaluations");
    if (evaluations.response.ok && evaluations.result) {
      evaluationsList.innerHTML = evaluations.result.evaluations.length > 0
        ? evaluations.result.evaluations.map((evaluation) => `
          <article class="course-card">
            <span class="course-meta">Nota ${evaluation.rating}/5</span>
            <h3>${evaluation.courseTitle}</h3>
            <p>${evaluation.userName} (${evaluation.userEmail})</p>
            <p>${evaluation.comment || "Sem coment\u00e1rio final."}</p><p><strong>Ponto mais valioso:</strong> ${(() => { try { const answers = evaluation.answersJson ? JSON.parse(evaluation.answersJson) : {}; return answers.learning || "N\u00e3o informado."; } catch (error) { return "N\u00e3o informado."; } })()}</p><p><strong>O que melhorar:</strong> ${(() => { try { const answers = evaluation.answersJson ? JSON.parse(evaluation.answersJson) : {}; return answers.improve || "N\u00e3o informado."; } catch (error) { return "N\u00e3o informado."; } })()}</p>
          </article>
        `).join("")
        : "<p class='empty-state'>Nenhuma avaliação enviada ainda.</p>";
    }
  };

  await fillCourses();

  courseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    courseMessage.textContent = "Criando curso...";

    const titleInput = document.querySelector("#course-title");
    const descriptionInput = document.querySelector("#course-description");
    const priceInput = document.querySelector("#course-price");

    const payload = {
      title: titleInput ? titleInput.value : "",
      description: descriptionInput ? descriptionInput.value : "",
      price: priceInput ? priceInput.value : "0"
    };

    const { response, result } = await fetchJson("/api/admin/courses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok || !result) {
      courseMessage.textContent = result.message || "Não foi possível criar o curso.";
      return;
    }

    courseMessage.textContent = result.message;
    courseForm.reset();
    await fillCourses();
  });

  lessonForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    lessonMessage.textContent = "Enviando aula e arquivos...";

    const courseId = courseSelect.value;
    const formData = new FormData(lessonForm);
    formData.delete("courseId");

    const response = await fetch(`/api/admin/courses/${courseId}/lessons`, {
      method: "POST",
      credentials: "same-origin",
      body: formData
    });

    const result = await response.json();

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok) {
      lessonMessage.textContent = result.message || "Não foi possível criar a aula.";
      return;
    }

    lessonMessage.textContent = result.message;
    lessonForm.reset();
    await fillCourses();
  });

  materialForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    materialMessage.textContent = "Enviando material complementar...";

    const selectedCourseId = materialCourseSelect.value;
    const formData = new FormData(materialForm);
    formData.delete("courseId");

    const response = await fetch(`/api/admin/courses/${selectedCourseId}/materials`, {
      method: "POST",
      credentials: "same-origin",
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      materialMessage.textContent = result.message || "Não foi possível enviar o material.";
      return;
    }

    materialMessage.textContent = result.message;
    materialForm.reset();
    await fillCourses();
  });

  releaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    releaseMessage.textContent = "Liberando curso...";

    const payload = {
      email: document.querySelector("#release-email").value || "",
      courseId: releaseCourseSelect.value
    };

    const { response, result } = await fetchJson("/api/admin/release-course", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (response.status === 403) {
      window.location.href = "/";
      return;
    }

    if (!response.ok || !result) {
      releaseMessage.textContent = result.message || "Não foi possível liberar o curso.";
      return;
    }

    releaseMessage.textContent = result.message;
    releaseForm.reset();
  });

  certificateReleaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    certificateReleaseMessage.textContent = "Liberando certificado...";

    const payload = {
      email: document.querySelector("#certificate-release-email").value || "",
      courseId: certificateReleaseCourseSelect.value
    };

    const { response, result } = await fetchJson("/api/admin/release-certificate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (response.status === 403) {
      window.location.href = "/";
      return;
    }

    if (!response.ok || !result) {
      certificateReleaseMessage.textContent = result.message || "Não foi possível liberar o certificado.";
      return;
    }

    certificateReleaseMessage.textContent = result.message;
    certificateReleaseForm.reset();
    await fillCourses();
  });

  promoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    promoMessage.textContent = "Criando código promocional...";

    const formData = new FormData(promoForm);
    const payload = {
      title: String(formData.get("title") || "").trim(),
      code: String(formData.get("code") || "").trim().toUpperCase(),
      description: String(formData.get("description") || "").trim(),
      discountType: formData.get("discountType"),
      discountValue: Number(formData.get("discountValue") || 0),
      minCourses: Number(formData.get("minCourses") || 1),
      maxRedemptions: Number(formData.get("maxRedemptions") || 0) || null,
      expiresAt: String(formData.get("expiresAt") || "").trim() || null,
      eligibleCourseIds: formData.getAll("eligibleCourseIds").map((value) => Number(value)).filter(Boolean)
    };

    const { response, result } = await fetchJson("/api/admin/promo-codes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok || !result) {
      promoMessage.textContent = result.message || "Não foi possível criar o código.";
      return;
    }

    promoMessage.textContent = result.message;
    promoForm.reset();
    await fillCourses();
  });
}

async function loadCertificatePage() {
  const student = document.querySelector("#certificate-student");
  const course = document.querySelector("#certificate-course");
  const date = document.querySelector("#certificate-date");
  const code = document.querySelector("#certificate-code");

  if (!student || !course || !date || !code) {
    return;
  }

  const courseId = window.location.pathname.split("/").pop();
  const { response, result } = await fetchJson(`/api/certificates/${courseId}`);

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  if (!response.ok || !result) {
    student.textContent = "Certificado indisponível";
    return;
  }

  student.textContent = result.certificate.userName;
  course.textContent = result.certificate.courseTitle;
  date.textContent = `Emitido em ${new Date(result.certificate.issuedAt).toLocaleDateString("pt-BR")}`;
  code.textContent = `Cdigo: ${result.certificate.certificateCode}`;
}

async function loadCheckoutPage() {
  const title = document.querySelector("#checkout-title");
  const subtitle = document.querySelector("#checkout-subtitle");
  const description = document.querySelector("#checkout-course-description");
  const coursesList = document.querySelector("#checkout-courses-list");
  const subtotal = document.querySelector("#checkout-subtotal");
  const bundleDiscount = document.querySelector("#checkout-bundle-discount");
  const promoDiscount = document.querySelector("#checkout-promo-discount");
  const price = document.querySelector("#checkout-price");
  const promoCodeForm = document.querySelector("#promo-code-form");
  const promoCodeInput = document.querySelector("#promo-code-input");
  const promoCodeMessage = document.querySelector("#promo-code-message");
  const createOrderButton = document.querySelector("#create-order-button");
  const message = document.querySelector("#checkout-message");
  const pixKey = document.querySelector("#pix-key");
  const pixBeneficiary = document.querySelector("#pix-beneficiary");
  const pixCopyCode = document.querySelector("#pix-copy-code");
  const pixQrWrapper = document.querySelector("#pix-qr-wrapper");
  const pixQrImage = document.querySelector("#pix-qr-image");

  if (!title || !subtitle || !description || !coursesList || !subtotal || !bundleDiscount || !promoDiscount || !price || !promoCodeForm || !promoCodeInput || !promoCodeMessage || !createOrderButton || !message || !pixKey || !pixBeneficiary || !pixCopyCode || !pixQrWrapper || !pixQrImage) {
    return;
  }

  const courseIds = getCheckoutCourseIdsFromLocation();

  if (courseIds.length === 0) {
    title.textContent = "Nenhum curso selecionado.";
    subtitle.textContent = "Volte ao catálogo para montar seu pedido.";
    createOrderButton.disabled = true;
    return;
  }

  const renderCheckout = async () => {
    const query = new URLSearchParams({
      ids: courseIds.join(","),
      promoCode: String(promoCodeInput.value || "").trim()
    });
    const { response, result } = await fetchJson(`/api/checkout-summary?${query.toString()}`);

    if (response.status === 401) {
      window.location.href = "/login";
      return null;
    }

    if (!response.ok || !result) {
      title.textContent = "Não foi possível carregar o checkout.";
      subtitle.textContent = result.message || "Tente novamente em alguns instantes.";
      createOrderButton.disabled = true;
      return null;
    }

    title.textContent = result.summary.courses.length > 1
      ? "Comprar combo de cursos"
      : `Comprar ${result.summary.courses[0].title}`;
    subtitle.textContent = "Gere seu pedido, pague por PIX e aguarde a liberação manual.";
    description.textContent = result.summary.courses.length > 1
      ? "Seu pedido em grupo concentra todos os cursos selecionados em uma única referência."
      : result.summary.courses[0].description || "Curso sem descrição.";

    coursesList.innerHTML = result.summary.courses.map((course) => `
      <article class="checkout-course-item">
        <strong>${course.title}</strong>
        <span>${formatCurrency(course.priceCents || 0)}</span>
      </article>
    `).join("");

    subtotal.textContent = result.summary.subtotalFormatted;
    bundleDiscount.textContent = result.summary.bundleDiscountFormatted;
    promoDiscount.textContent = result.summary.promoDiscountFormatted;
    price.textContent = result.summary.totalFormatted;
    pixKey.textContent = result.pix.key || "Configure a variável PIX_KEY";
    pixBeneficiary.textContent = result.pix.beneficiary || "Configure a variável PIX_BENEFICIARY";
    pixCopyCode.value = result.pix.copyPasteCode || "Configure a variável PIX_COPY_PASTE_CODE";

    if (result.pix.qrCodeImageUrl) {
      pixQrImage.src = result.pix.qrCodeImageUrl;
      pixQrWrapper.classList.remove("hidden");
    } else {
      pixQrWrapper.classList.add("hidden");
    }

    if (promoCodeInput.value.trim()) {
      promoCodeMessage.textContent = result.summary.promoMessage || (result.summary.promoCode
        ? `Cupom ${result.summary.promoCode.code} aplicado com sucesso.`
        : "Cupom não encontrado ou inativo.");
    } else {
      promoCodeMessage.textContent = result.summary.bundleDiscountCents > 0
        ? "Desconto automático de combo aplicado."
        : "";
    }

    createOrderButton.disabled = false;
    return result;
  };

  await renderCheckout();

  promoCodeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    promoCodeMessage.textContent = "Aplicando cupom...";
    await renderCheckout();
  });

  createOrderButton.addEventListener("click", async () => {
    createOrderButton.disabled = true;
    message.textContent = "Gerando pedido...";

    const orderResult = await fetchJson("/api/checkout/order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        courseIds,
        promoCode: String(promoCodeInput.value || "").trim()
      })
    });

    createOrderButton.disabled = false;

    if (!orderResult.response.ok || !orderResult.result) {
      message.textContent = orderResult.result.message || "Não foi possível gerar o pedido.";
      return;
    }

    if (courseIds.length > 1) {
      setSelectedCourseIds([]);
    }

    await renderCheckout();
    message.textContent = `${orderResult.result.message} Informe esta referência ao administrador: ${orderResult.result.groupReference}. Total do pedido: ${orderResult.result.totalFormatted}.`;
  });
}

document.querySelectorAll("form[data-form-type]").forEach((form) => {
  form.addEventListener("submit", handleFormSubmit);
});

loadSession();

const currentPage = document.body.dataset.page;

if (currentPage === "courses") {
  loadCoursesPage();
}

if (currentPage === "dashboard") {
  loadDashboardPage();
}

if (currentPage === "lesson") {
  loadLessonPage();
}

if (currentPage === "admin") {
  loadAdminPage();
}

if (currentPage === "checkout") {
  loadCheckoutPage();
}

if (currentPage === "certificate") {
  loadCertificatePage();
}


