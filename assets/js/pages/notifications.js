/**
 * @file notifications.js
 * @module pages/notifications
 *
 * Trang Thông báo — Xử lý toàn bộ logic hiển thị và tương tác:
 *  1. Xóa badge số chưa đọc ngay khi vào trang + gọi API đánh dấu đã đọc.
 *  2. Render danh sách thông báo động từ API (cursor-based infinite scroll).
 *  3. Phân cách trực quan giữa thông báo chưa đọc và đã đọc.
 *  4. Click vào thông báo:
 *     - LIKE_POST / COMMENT / NEW_POST → lấy bài đăng rồi mở comment-modal.
 *     - FOLLOW → chuyển hướng đến profile người dùng.
 */

"use strict";

import { notificationApi } from "../api/notification-api.js";
import { initCommentModal } from "../components/comment-modal.js";
import { initCreatePostModal } from "../components/create-post-modal.js";

// ---------------------------------------------------------------------------
// Constants & config
// ---------------------------------------------------------------------------

/** Số thông báo mỗi trang (API quyết định, FE không cần set, chỉ dùng cho skeleton) */
const SKELETON_COUNT = 5;

/** Scroll threshold (px) — tải thêm khi cách đáy trang ít hơn ngưỡng này */
const SCROLL_THRESHOLD = 240;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const state = {
	/** ID thông báo cuối cùng đã tải (dùng cho cursor pagination) */
	lastNotiId: null,

	/** Còn dữ liệu để tải không */
	hasMore: true,

	/** Đang loading để chống gọi API đồng thời */
	isLoading: false,

	/** Đã render thanh phân cách (chưa đọc / đã đọc) hay chưa */
	dividerInserted: false,
};

// ---------------------------------------------------------------------------
// DOM refs (resolved in initNotificationsPage)
// ---------------------------------------------------------------------------

let listEl;       // #notifications-list
let statusEl;     // #notifications-status

// ---------------------------------------------------------------------------
// Comment modal controller (dùng khi click vào thông báo bài đăng)
// ---------------------------------------------------------------------------

let commentModalController = null;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

const DEFAULT_AVATAR = "../assets/images/default-avatar.png";

/**
 * Escape HTML để tránh XSS.
 * @param {*} value
 * @returns {string}
 */
const escapeHtml = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

/**
 * Trích xuất message từ lỗi API hoặc Error object.
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
const toErrorMessage = (error, fallback = "Đã có lỗi xảy ra.") => {
	if (typeof error?.data?.message === "string" && error.data.message.trim()) {
		return error.data.message.trim();
	}
	if (typeof error?.message === "string" && error.message.trim()) {
		return error.message.trim();
	}
	return fallback;
};

// ---------------------------------------------------------------------------
// Badge config — ánh xạ từ type → icon & class CSS
// ---------------------------------------------------------------------------

/**
 * Trả về thông tin badge (CSS class + tên icon Boxicons) theo notification type.
 * @param {"LIKE_POST"|"COMMENT"|"NEW_POST"|"FOLLOW"} type
 * @returns {{ badgeClass: string, iconClass: string }}
 */
const getBadgeConfig = (type) => {
	switch (type) {
		case "LIKE_POST":
			return { badgeClass: "like-badge",     iconClass: "bxs-heart" };
		case "COMMENT":
			return { badgeClass: "comment-badge",  iconClass: "bxs-message-rounded-dots" };
		case "FOLLOW":
			return { badgeClass: "follow-badge",   iconClass: "bxs-user" };
		case "NEW_POST":
		default:
			return { badgeClass: "new-post-badge", iconClass: "bx-bell" };
	}
};

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

/**
 * Render N skeleton items vào list khi đang tải lần đầu.
 */
const renderSkeletons = (count = SKELETON_COUNT) => {
	if (!listEl) return;
	const html = Array.from({ length: count }, () => `
		<div class="notification-skeleton" aria-hidden="true">
			<div class="notification-skeleton__avatar is-skeleton"></div>
			<div class="notification-skeleton__body">
				<div class="notification-skeleton__line is-skeleton"></div>
				<div class="notification-skeleton__line notification-skeleton__line--short is-skeleton"></div>
			</div>
		</div>
	`).join("");
	listEl.innerHTML = html;
};

/**
 * Xóa tất cả skeleton items khỏi list.
 */
const clearSkeletons = () => {
	if (!listEl) return;
	listEl.querySelectorAll(".notification-skeleton").forEach((el) => el.remove());
};

// ---------------------------------------------------------------------------
// Status bar helpers
// ---------------------------------------------------------------------------

/**
 * Hiển thị trạng thái bên dưới danh sách (đang tải / đã hết / lỗi).
 * @param {string} text
 * @param {"loading"|"end"|"error"|""} variant
 */
const showStatus = (text, variant = "") => {
	if (!statusEl) return;
	statusEl.textContent = text;
	statusEl.className = "notifications-status";
	if (variant) statusEl.classList.add(`is-${variant}`);
	statusEl.classList.remove("is-hidden");
};

const hideStatus = () => {
	if (!statusEl) return;
	statusEl.className = "notifications-status is-hidden";
	statusEl.textContent = "";
};

// ---------------------------------------------------------------------------
// Toast notification
// ---------------------------------------------------------------------------

/**
 * Hiển thị toast message nhanh (dùng cho lỗi 403/404 khi click thông báo bài đăng).
 * @param {string} message
 * @param {"info"|"error"|"success"} variant
 * @param {number} duration
 */
const showToast = (message, variant = "info", duration = 3500) => {
	let container = document.getElementById("noti-toast-container");
	if (!container) {
		container = document.createElement("div");
		container.id = "noti-toast-container";
		container.className = "toast-container";
		document.body.appendChild(container);
	}

	const toast = document.createElement("div");
	toast.className = `toast toast--${variant}`;
	toast.setAttribute("role", "status");
	toast.setAttribute("aria-live", "polite");
	toast.textContent = message;
	container.appendChild(toast);

	void toast.offsetWidth; // trigger reflow for animation
	toast.classList.add("toast--visible");

	window.setTimeout(() => {
		toast.classList.remove("toast--visible");
		toast.addEventListener("transitionend", () => toast.remove(), { once: true });
	}, duration);
};

// ---------------------------------------------------------------------------
// Render một item thông báo
// ---------------------------------------------------------------------------

/**
 * Tạo HTML string cho một item thông báo.
 * @param {{
 *   id: string,
 *   targetId: string,
 *   avtUrl: string,
 *   content: string,
 *   isRead: boolean,
 *   createAt: string,
 *   type: string
 * }} notification
 * @returns {string}
 */
const createNotificationItemHtml = (notification) => {
	const { id, targetId, avtUrl, content, isRead, createAt, type } = notification;
	const { badgeClass, iconClass } = getBadgeConfig(type);

	const safeAvt    = escapeHtml(avtUrl || DEFAULT_AVATAR);
	const safeContent = escapeHtml(content || "Bạn có thông báo mới.");
	const safeTime   = escapeHtml(createAt || "");
	const safeId     = escapeHtml(id || "");
	const safeTarget = escapeHtml(targetId || "");
	const safeType   = escapeHtml(type || "");

	const unreadClass = isRead ? "" : " is-unread";

	return `
		<div class="notification-item${unreadClass}"
			 role="button"
			 tabindex="0"
			 data-noti-id="${safeId}"
			 data-target-id="${safeTarget}"
			 data-noti-type="${safeType}"
			 aria-label="${safeContent}">
			<!-- Avatar + Badge -->
			<div class="notification-user">
				<img
					class="notification-avatar"
					src="${safeAvt}"
					alt="Avatar"
					onerror="this.src='${DEFAULT_AVATAR}'"
				>
				<span class="notification-badge ${badgeClass}" aria-hidden="true">
					<i class="bx ${iconClass}"></i>
				</span>
			</div>

			<!-- Nội dung + Thời gian -->
			<div class="notification-content">
				<p>${safeContent}</p>
				${safeTime ? `<span class="notification-time">${safeTime}</span>` : ""}
			</div>
		</div>
	`.trim();
};

// ---------------------------------------------------------------------------
// Render danh sách thông báo (có thanh phân cách chưa đọc / đã đọc)
// ---------------------------------------------------------------------------

/**
 * Render và append một mảng thông báo vào danh sách.
 * Tự chèn thanh phân cách khi chuyển từ chưa đọc sang đã đọc (chỉ 1 lần).
 * @param {object[]} notifications
 */
const appendNotifications = (notifications) => {
	if (!listEl || notifications.length === 0) return;

	const fragment = document.createDocumentFragment();

	notifications.forEach((noti) => {
		// Nếu đây là thông báo đã đọc đầu tiên và chưa chèn divider → chèn thanh phân cách
		if (noti.isRead && !state.dividerInserted) {
			// Chỉ chèn nếu có ít nhất 1 thông báo chưa đọc ở phía trên
			const hasUnread = listEl.querySelector(".notification-item.is-unread");
			if (hasUnread) {
				const divider = document.createElement("div");
				divider.className = "notification-divider";
				divider.textContent = "Đã đọc";
				divider.setAttribute("aria-label", "Thông báo đã đọc");
				fragment.appendChild(divider);
			}
			state.dividerInserted = true;
		}

		// Tạo và chèn item
		const temp = document.createElement("template");
		temp.innerHTML = createNotificationItemHtml(noti);
		fragment.appendChild(temp.content.firstElementChild);
	});

	listEl.appendChild(fragment);
};

// ---------------------------------------------------------------------------
// Load notifications — gọi API và render
// ---------------------------------------------------------------------------

/**
 * Tải một trang thông báo từ API và render vào danh sách.
 * Guard bằng isLoading / hasMore để tránh gọi chồng chéo.
 * @param {boolean} isFirstLoad - true nếu đây là lần tải đầu tiên (hiện skeleton).
 */
const loadNotifications = async (isFirstLoad = false) => {
	if (state.isLoading || !state.hasMore) return;

	state.isLoading = true;

	if (isFirstLoad) {
		renderSkeletons(SKELETON_COUNT);
		hideStatus();
	} else {
		showStatus("Đang tải thêm...", "loading");
	}

	try {
		const response = await notificationApi.getNotifications(state.lastNotiId);
		const data = response?.data;
		const notifications = Array.isArray(data?.notifications) ? data.notifications : [];

		if (isFirstLoad) {
			clearSkeletons();
		} else {
			hideStatus();
		}

		// Render các thông báo nhận được
		appendNotifications(notifications);

		// Cập nhật cursor và flag hasMore
		const newLastId = typeof data?.respLastNotiId === "string" && data.respLastNotiId.trim()
			? data.respLastNotiId.trim()
			: state.lastNotiId;
		state.lastNotiId = newLastId;
		state.hasMore = data?.hasMore === true;

		// Nếu không còn dữ liệu → hiển thị kết thúc
		if (!state.hasMore) {
			if (listEl.children.length > 0) {
				showStatus("Đã tải hết thông báo", "end");
			} else {
				showStatus("Bạn chưa có thông báo nào.", "end");
			}
		}
	} catch (error) {
		if (isFirstLoad) clearSkeletons();
		hideStatus();
		console.error("[notifications] Lỗi khi tải thông báo:", error);
		showStatus("Không thể tải thông báo. Vui lòng thử lại.", "error");
	} finally {
		state.isLoading = false;
	}
};

// ---------------------------------------------------------------------------
// Mark all as read — gọi API và xóa badge trên sidebar
// ---------------------------------------------------------------------------

/**
 * Đánh dấu tất cả thông báo là đã đọc:
 *  1. Xóa ngay badge số trên icon chuông trong sidebar (UI-only, không đợi API).
 *  2. Gọi API PATCH /api/notifications để đồng bộ với server.
 */
const markAllAsReadAndClearBadge = async () => {
	// Xóa badge ngay lập tức (không đợi API) để UX phản hồi tức thì
	clearUnreadBadgeOnSidebar();

	try {
		await notificationApi.markAllAsRead();
	} catch (error) {
		// Không cần báo lỗi ra UI, thất bại thầm lặng là chấp nhận được
		console.warn("[notifications] Không thể đánh dấu đã đọc:", error);
	}
};

/**
 * Xóa/ẩn badge số thông báo chưa đọc trên icon chuông ở sidebar.
 * Dùng selector chung để khớp với DOM được tạo bởi sidebar.js.
 */
const clearUnreadBadgeOnSidebar = () => {
	// Badge thông báo trên sidebar (nếu có)
	const badge = document.querySelector(".nav-item[href='notifications.html'] .noti-badge, #noti-count-badge");
	if (badge) {
		badge.textContent = "";
		badge.classList.add("is-hidden");
	}
};

// ---------------------------------------------------------------------------
// Click handler — xử lý click vào một item thông báo
// ---------------------------------------------------------------------------

/**
 * Xử lý sự kiện click vào một thông báo.
 * Phân loại theo type và điều hướng tương ứng.
 * @param {HTMLElement} item - Phần tử .notification-item được click.
 */
const handleNotificationClick = async (item) => {
	const type     = item.dataset.notiType;
	const targetId = item.dataset.targetId;

	if (!type || !targetId) return;

	// Xóa trạng thái chưa đọc ngay khi click (UI feedback)
	item.classList.remove("is-unread");

	if (type === "LIKE_POST" || type === "COMMENT" || type === "NEW_POST") {
		// targetId là postId → lấy chi tiết bài và mở comment-modal
		await handlePostNotificationClick(targetId);
	} else if (type === "FOLLOW") {
		// targetId là userId → chuyển hướng đến trang profile
		window.location.href = `profile.html?id=${encodeURIComponent(targetId)}`;
	}
};

/**
 * Xử lý click vào thông báo liên quan đến bài đăng (LIKE_POST / COMMENT / NEW_POST).
 * Gọi API GET /api/posts/{postId}, xử lý lỗi 403/404, mở comment-modal nếu thành công.
 * @param {string} postId
 */
const handlePostNotificationClick = async (postId) => {
	try {
		const response = await notificationApi.getPostById(postId);
		const post = response?.data;

		if (!post) {
			showToast("Không thể tải bài viết. Vui lòng thử lại.", "error");
			return;
		}

		// Mở comment-modal với dữ liệu bài viết
		if (commentModalController && typeof commentModalController.open === "function") {
			commentModalController.open(post);
		} else {
			console.warn("[notifications] comment-modal chưa được khởi tạo.");
		}
	} catch (error) {
		const status = error?.status;
		const message = toErrorMessage(error, "Không thể tải bài viết.");

		// 403: bài bị ẩn/xóa, 404: không tồn tại — hiện thông báo cho người dùng
		if (status === 403 || status === 404) {
			showToast(message, "error");
		} else {
			console.error("[notifications] Lỗi khi lấy bài đăng:", error);
			showToast("Đã xảy ra lỗi. Vui lòng thử lại.", "error");
		}
	}
};

// ---------------------------------------------------------------------------
// Event delegation — click vào item trong danh sách
// ---------------------------------------------------------------------------

/**
 * Đăng ký event delegation cho toàn bộ danh sách thông báo.
 * Bắt click và keyboard (Enter/Space) trên .notification-item.
 */
const bindListEvents = () => {
	if (!listEl) return;

	// Click delegation
	listEl.addEventListener("click", (event) => {
		const item = event.target.closest(".notification-item");
		if (!item) return;
		void handleNotificationClick(item);
	});

	// Keyboard: Enter / Space để kích hoạt (accessibility)
	listEl.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		const item = event.target.closest(".notification-item");
		if (!item) return;
		event.preventDefault();
		void handleNotificationClick(item);
	});
};

// ---------------------------------------------------------------------------
// Infinite scroll
// ---------------------------------------------------------------------------

/**
 * Handler cho sự kiện scroll — tải thêm khi sắp đến cuối trang.
 */
const handleScroll = () => {
	if (state.isLoading || !state.hasMore) return;
	const currentScroll = window.innerHeight + window.scrollY;
	const scrollBottom  = document.documentElement.scrollHeight - SCROLL_THRESHOLD;
	if (currentScroll >= scrollBottom) {
		void loadNotifications(false);
	}
};

// ---------------------------------------------------------------------------
// Page initializer
// ---------------------------------------------------------------------------

const initNotificationsPage = () => {
	// Resolve DOM refs
	listEl   = document.getElementById("notifications-list");
	statusEl = document.getElementById("notifications-status");

	if (!listEl) return;

	// Khởi tạo create-post-modal (cần thiết nếu comment-modal dùng đến)
	initCreatePostModal();

	// Khởi tạo comment-modal và lưu controller
	commentModalController = initCommentModal();

	// 1. Xóa badge chưa đọc + gọi API đánh dấu đã đọc
	void markAllAsReadAndClearBadge();

	// 2. Tải danh sách thông báo lần đầu
	void loadNotifications(true);

	// 3. Bind sự kiện click
	bindListEvents();

	// 4. Đăng ký infinite scroll
	window.addEventListener("scroll", handleScroll, { passive: true });
};

document.addEventListener("DOMContentLoaded", initNotificationsPage);
