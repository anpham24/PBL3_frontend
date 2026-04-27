"use strict";

import { postApi } from "../api/post-api.js";

const ALLOWED_ROLES = new Set(["MODERATOR", "ADMIN"]);

const SIDEBAR_BASE_ITEMS = [
	{
		id: "home",
		label: "Trang chủ",
		href: "feed.html",
		icon: "bx-home-alt-2",
		activePages: ["feed.html"]
	},
	{
		id: "create-post",
		label: "Tạo bài đăng",
		href: "feed.html",
		icon: "bx-plus-circle",
		activePages: []
	},
	{
		id: "profile",
		label: "Trang cá nhân",
		href: "profile.html",
		icon: "bx-user",
		activePages: ["profile.html"]
	},
	{
		id: "notifications",
		label: "Thông báo",
		href: "notifications.html",
		icon: "bx-bell",
		activePages: ["notifications.html"]
	},
	{
		id: "settings",
		label: "Cài đặt",
		href: "settings.html",
		icon: "bx-cog",
		activePages: ["settings.html"]
	}
];

const SIDEBAR_MANAGEMENT_ITEMS = [
	{
		id: "reports",
		label: "Quản lý báo cáo",
		href: "reports.html",
		icon: "bx-shield-quarter",
		roles: ["MODERATOR", "ADMIN"],
		activePages: ["reports.html"]
	},
	{
		id: "users",
		label: "Quản lý người dùng",
		href: "users.html",
		icon: "bx-group",
		roles: ["ADMIN"],
		activePages: ["users.html"]
	}
];

const DEFAULT_AVATAR_URL =
	"https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=60";

const reportsState = {
	posts: [],
	keyword: ""
};

let reportedPostListElement;
let reportsCountBadgeElement;
let reportsEmptyStateElement;
let reportsSearchInputElement;
let reportsStatusElement;

const escapeHtml = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#039;");

const safeText = (value) => {
	if (typeof value !== "string") {
		return "";
	}

	return value.trim();
};

const safeNumber = (value, fallback = 0) => {
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : fallback;
};

const formatNumber = (value) => new Intl.NumberFormat("vi-VN").format(safeNumber(value, 0));

const normalizeSearchText = (value) =>
	safeText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();

const toMessage = (error, fallbackMessage) => {
	if (typeof error?.data?.message === "string" && error.data.message.trim().length > 0) {
		return error.data.message.trim();
	}

	if (typeof error?.message === "string" && error.message.trim().length > 0) {
		return error.message.trim();
	}

	return fallbackMessage;
};

const getUserRole = () => {
	const authRole = localStorage.getItem("authRole");
	if (typeof authRole === "string" && authRole.trim().length > 0) {
		return authRole.trim().toUpperCase();
	}

	const legacyRole = localStorage.getItem("userRole");
	return typeof legacyRole === "string" ? legacyRole.trim().toUpperCase() : "";
};

const getCurrentPage = () => {
	const page = window.location.pathname.split("/").pop();
	return typeof page === "string" && page.length > 0 ? page : "reports.html";
};

const isVisibleForRole = (item, userRole) => {
	if (!Array.isArray(item.roles) || item.roles.length === 0) {
		return true;
	}

	return item.roles.includes(userRole);
};

const isActiveSidebarItem = (item, currentPage) =>
	Array.isArray(item.activePages) && item.activePages.includes(currentPage);

const ensureModeratorAccess = () => {
	const userRole = getUserRole();

	if (!ALLOWED_ROLES.has(userRole)) {
		window.location.href = "feed.html";
		return "";
	}

	return userRole;
};

const renderSidebar = (userRole) => {
	const sidebar = document.getElementById("app-sidebar");
	if (!sidebar) {
		return;
	}

	const currentPage = getCurrentPage();
	const items = SIDEBAR_BASE_ITEMS.concat(
		SIDEBAR_MANAGEMENT_ITEMS.filter((item) => isVisibleForRole(item, userRole))
	);

	const navHtml = items
		.map((item) => {
			const activeClass = isActiveSidebarItem(item, currentPage) ? " active" : "";
			const createPostClass = item.id === "create-post" ? " create-post-link" : "";

			return `
				<a class="nav-item${createPostClass}${activeClass}" href="${item.href}">
					<i class="bx ${item.icon}"></i>
					<span class="nav-label">${item.label}</span>
				</a>
			`;
		})
		.join("");

	sidebar.innerHTML = `
		<h1 class="brand">DUTraveler</h1>
		<nav class="side-nav" aria-label="Sidebar navigation">
			${navHtml}
		</nav>
	`;
};

const setStatus = (message, variant = "info") => {
	if (!reportsStatusElement) {
		return;
	}

	reportsStatusElement.textContent = message;
	reportsStatusElement.classList.toggle("is-hidden", safeText(message).length === 0);

	if (variant === "error") {
		reportsStatusElement.style.color = "#b91c1c";
		return;
	}

	if (variant === "success") {
		reportsStatusElement.style.color = "#15803d";
		return;
	}

	reportsStatusElement.style.color = "#4b5563";
};

const clearStatus = () => {
	setStatus("");
	if (reportsStatusElement) {
		reportsStatusElement.style.color = "";
	}
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const normalizeReasons = (post) => {
	const rawReasons = Array.isArray(post?.report_reasons)
		? post.report_reasons
		: Array.isArray(post?.reasons)
			? post.reasons
			: [];

	const reasons = rawReasons
		.map((reason, index) => {
			if (typeof reason === "string") {
				const label = safeText(reason);
				return label.length > 0
					? {
						id: `reason-${index + 1}`,
						label,
						details: "",
						reporter: "",
						time: ""
					}
					: null;
			}

			if (!reason || typeof reason !== "object") {
				return null;
			}

			const label =
				safeText(reason.reason) ||
				safeText(reason.title) ||
				safeText(reason.name) ||
				safeText(reason.message) ||
				"Lý do chưa xác định";

			return {
				id: safeText(reason.id) || `reason-${index + 1}`,
				label,
				details: safeText(reason.details) || safeText(reason.description),
				reporter:
					safeText(reason.reporter_name) ||
					safeText(reason.reported_by) ||
					safeText(reason.username),
				time:
					safeText(reason.created_at) ||
					safeText(reason.createdAt) ||
					safeText(reason.time)
			};
		})
		.filter(Boolean);

	if (reasons.length > 0) {
		return reasons;
	}

	const fallbackReason = safeText(post?.report_reason) || safeText(post?.reportReason);
	if (fallbackReason.length === 0) {
		return [];
	}

	return [
		{
			id: "reason-fallback",
			label: fallbackReason,
			details: "",
			reporter: "",
			time: ""
		}
	];
};

const normalizePost = (post, index) => {
	const tags = toArray(post?.tags)
		.map((tag) => safeText(typeof tag === "string" ? tag : tag?.name || tag?.label))
		.filter((tag) => tag.length > 0);

	const reasons = normalizeReasons(post);
	const reportCount = safeNumber(post?.report_count ?? post?.reportCount, reasons.length);

	return {
		id: safeText(post?.id || post?.post_id || post?.postId) || `reported-post-${index + 1}`,
		authorName: safeText(post?.author_name || post?.authorName || post?.username) || "Người dùng",
		authorAvatar: safeText(post?.avatar_url || post?.authorAvatar || post?.avt_url) || DEFAULT_AVATAR_URL,
		location: safeText(post?.location || post?.address),
		time: safeText(post?.time || post?.created_at || post?.createdAt),
		tags,
		content: safeText(post?.content || post?.caption),
		imageUrl:
			safeText(post?.image_url || post?.imageUrl || post?.media_url) ||
			safeText(toArray(post?.media_urls)[0] || toArray(post?.mediaUrls)[0]),
		likeCount: safeNumber(post?.like_count ?? post?.likeCount, 0),
		reportCount,
		reasons
	};
};

const resolvePostsPayload = (response) => {
	if (Array.isArray(response?.data?.posts)) {
		return response.data.posts;
	}

	if (Array.isArray(response?.data?.items)) {
		return response.data.items;
	}

	if (Array.isArray(response?.data)) {
		return response.data;
	}

	return [];
};

const buildTagsHtml = (tags) => {
	if (!Array.isArray(tags) || tags.length === 0) {
		return "";
	}

	return `
		<div class="post-tags">
			${tags.map((tag) => `<span class="post-tag">${escapeHtml(tag)}</span>`).join("")}
		</div>
	`;
};

const toDomSafeId = (value) =>
	safeText(value)
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "") || "post";

const buildReasonItemsHtml = (post) => {
	if (!Array.isArray(post.reasons) || post.reasons.length === 0) {
		return '<li class="reason-item">Chưa có thông tin lý do chi tiết.</li>';
	}

	return post.reasons
		.map((reason) => {
			const metadata = [reason.reporter, reason.time].filter((item) => safeText(item).length > 0).join(" • ");

			return `
				<li class="reason-item">
					<p class="reason-title">${escapeHtml(reason.label)}</p>
					${
						safeText(reason.details).length > 0
							? `<p class="reason-details">${escapeHtml(reason.details)}</p>`
							: ""
					}
					${metadata.length > 0 ? `<p class="reason-meta">${escapeHtml(metadata)}</p>` : ""}
				</li>
			`;
		})
		.join("");
};

const createPostCardHtml = (post) => {
	const tagsHtml = buildTagsHtml(post.tags);
	const imageHtml = post.imageUrl
		? `<img class="post-image" src="${escapeHtml(post.imageUrl)}" alt="Ảnh bài đăng bị báo cáo">`
		: "";
	const reasonsSectionId = `post-reasons-${toDomSafeId(post.id)}`;
	const locationMeta = safeText(post.location);
	const timeMeta = safeText(post.time);

	return `
		<article class="post-card" data-post-id="${escapeHtml(post.id)}">
			<header class="post-header">
				<div class="post-author">
					<img class="avatar" src="${escapeHtml(post.authorAvatar)}" alt="Avatar ${escapeHtml(post.authorName)}">
					<div class="post-meta">
						<div class="post-meta-row">
							<h3>${escapeHtml(post.authorName)}</h3>
							${
								timeMeta.length > 0
									? `<span class="meta-divider">&bull;</span><span class="post-time">${escapeHtml(timeMeta)}</span>`
									: ""
							}
						</div>
						${locationMeta.length > 0 ? `<p>${escapeHtml(locationMeta)}</p>` : ""}
					</div>
				</div>
			</header>

			${tagsHtml}
			${imageHtml}

			<footer class="post-footer">
				<p class="likes">${escapeHtml(formatNumber(post.likeCount))} lượt thích</p>
				<p class="caption"><strong>${escapeHtml(post.authorName)}</strong>${escapeHtml(post.content)}</p>
			</footer>

			<p class="report-meta">
				<i class="bx bx-flag"></i>
				<span>${escapeHtml(formatNumber(post.reportCount))} báo cáo</span>
			</p>

			<div class="report-actions">
				<button
					class="report-action-btn report-reasons-btn"
					type="button"
					data-action="toggle-reasons"
					data-post-id="${escapeHtml(post.id)}"
					aria-controls="${escapeHtml(reasonsSectionId)}"
					aria-expanded="false"
				>
					<i class="bx bx-list-ul"></i>
					<span>Xem lý do báo cáo</span>
				</button>
				<button
					class="report-action-btn report-delete-btn"
					type="button"
					data-action="delete"
					data-post-id="${escapeHtml(post.id)}"
				>
					<i class="bx bx-trash"></i>
					<span>Xóa bài đăng</span>
				</button>
			</div>

			<section id="${escapeHtml(reasonsSectionId)}" class="report-reasons is-hidden" data-role="report-reasons">
				<h4>Chi tiết lý do báo cáo</h4>
				<ul class="reason-list">
					${buildReasonItemsHtml(post)}
				</ul>
			</section>
		</article>
	`;
};

const getFilteredPosts = () => {
	const keyword = normalizeSearchText(reportsState.keyword);

	if (keyword.length === 0) {
		return reportsState.posts;
	}

	return reportsState.posts.filter((post) => {
		const authorName = normalizeSearchText(post.authorName);
		const content = normalizeSearchText(post.content);
		return authorName.includes(keyword) || content.includes(keyword);
	});
};

const updateReportCount = () => {
	if (!reportsCountBadgeElement) {
		return;
	}

	const visibleCount = getFilteredPosts().length;
	const totalCount = reportsState.posts.length;

	reportsCountBadgeElement.textContent =
		reportsState.keyword.length > 0
			? `${visibleCount}/${totalCount} bài viết bị báo cáo`
			: `${visibleCount} bài viết bị báo cáo`;
};

const syncEmptyState = () => {
	if (!reportsEmptyStateElement) {
		return;
	}

	const hasItems = getFilteredPosts().length > 0;
	reportsEmptyStateElement.classList.toggle("is-hidden", hasItems);
};

const toggleReasonsSection = (clickedButton) => {
	const postCard = clickedButton.closest(".post-card");
	const reasonsSection = postCard?.querySelector('[data-role="report-reasons"]');

	if (!reasonsSection) {
		return;
	}

	const willOpen = reasonsSection.classList.contains("is-hidden");
	reasonsSection.classList.toggle("is-hidden", !willOpen);
	clickedButton.setAttribute("aria-expanded", String(willOpen));

	const label = clickedButton.querySelector("span");
	if (label) {
		label.textContent = willOpen ? "Ẩn lý do báo cáo" : "Xem lý do báo cáo";
	}
};

const renderReportedPosts = (posts = getFilteredPosts()) => {
	if (!reportedPostListElement) {
		return;
	}

	reportedPostListElement.innerHTML = posts.map(createPostCardHtml).join("");
	updateReportCount();
	syncEmptyState();
};

const deletePostById = async (postId, clickedButton) => {
	const shouldRemove = window.confirm("Bạn có chắc chắn muốn xóa bài đăng này? Hành động không thể hoàn tác.");
	if (!shouldRemove) {
		return;
	}

	clickedButton.disabled = true;
	setStatus("Đang xóa bài đăng...");

	try {
		await postApi.deletePost(postId);
		reportsState.posts = reportsState.posts.filter((post) => post.id !== postId);
		renderReportedPosts();
		setStatus("Đã xóa bài đăng thành công.", "success");
	} catch (error) {
		setStatus(toMessage(error, "Không thể xóa bài đăng. Vui lòng thử lại."), "error");
		clickedButton.disabled = false;
	}
};

const handleReportAction = (event) => {
	const clickedButton = event.target.closest(".report-action-btn");
	if (!clickedButton) {
		return;
	}

	const action = clickedButton.dataset.action;
	const postId = safeText(clickedButton.dataset.postId);

	if (action === "toggle-reasons") {
		toggleReasonsSection(clickedButton);
		return;
	}

	if (action === "delete" && postId.length > 0) {
		void deletePostById(postId, clickedButton);
	}
};

const handleSearchChange = () => {
	reportsState.keyword = safeText(reportsSearchInputElement?.value);
	renderReportedPosts();

	if (getFilteredPosts().length === 0 && reportsState.keyword.length > 0) {
		setStatus("Không tìm thấy bài viết nào khớp từ khóa.");
		return;
	}

	clearStatus();
};

const loadReportedPosts = async () => {
	setStatus("Đang tải danh sách báo cáo...");

	try {
		const response = await postApi.getReportedPosts();
		reportsState.posts = resolvePostsPayload(response).map(normalizePost);
		renderReportedPosts(reportsState.posts);

		if (reportsState.posts.length === 0) {
			setStatus("Không có bài viết nào đang bị báo cáo.");
			return;
		}

		clearStatus();
	} catch (error) {
		reportsState.posts = [];
		renderReportedPosts([]);
		setStatus(toMessage(error, "Không thể tải danh sách báo cáo."), "error");
	}
};

const initReportsPage = async () => {
	const userRole = ensureModeratorAccess();
	if (userRole.length === 0) {
		return;
	}

	reportedPostListElement = document.getElementById("reported-post-list");
	reportsCountBadgeElement = document.getElementById("reports-count-badge");
	reportsEmptyStateElement = document.getElementById("reports-empty-state");
	reportsSearchInputElement = document.getElementById("reports-search-input");
	reportsStatusElement = document.getElementById("reports-status");

	if (!reportedPostListElement) {
		return;
	}

	renderSidebar(userRole);
	reportedPostListElement.addEventListener("click", handleReportAction);

	reportsSearchInputElement?.addEventListener("input", handleSearchChange);
	reportsSearchInputElement?.addEventListener("keydown", (event) => {
		if (event.key !== "Enter") {
			return;
		}

		event.preventDefault();
		handleSearchChange();
	});

	await loadReportedPosts();
};

document.addEventListener("DOMContentLoaded", initReportsPage);