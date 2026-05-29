"use strict";

import { getRoleFromToken, getUserId } from "../utils/auth.js";
import { notificationApi } from "../api/notification-api.js";

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
		id: "search",
		label: "Tìm kiếm",
		href: "search.html",
		icon: "bx-search-alt",
		activePages: ["search.html"]
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalizeRole = (value) => {
	if (typeof value !== "string") {
		return "";
	}

	return value.trim().toUpperCase();
};

const getCurrentUserRole = () => {
	return normalizeRole(getRoleFromToken());
};

const getCurrentPage = () => {
	const page = window.location.pathname.split("/").pop();
	return typeof page === "string" && page.length > 0 ? page : "feed.html";
};

const isVisibleForRole = (item, userRole) => {
	if (!Array.isArray(item.roles) || item.roles.length === 0) {
		return true;
	}

	return item.roles.includes(userRole);
};

const isActiveItem = (item, currentPage) => {
	if (!Array.isArray(item.activePages) || item.activePages.length === 0) {
		return false;
	}

	// Xử lý riêng cho mục "Trang cá nhân" (profile)
	if (item.id === "profile" && item.activePages.includes(currentPage)) {
		const query = new URLSearchParams(window.location.search);
		const targetId = query.get("id");

		// Nếu URL có chứa param ?id=... 
		if (targetId && targetId.trim() !== "") {
			const currentUserId = getUserId();

			// Nếu id trên URL khác với id của user hiện tại -> Đang xem profile người khác
			if (targetId.trim() !== currentUserId) {
				return false; // Không active (không bôi đậm)
			}
		}
	}

	return item.activePages.includes(currentPage);
};

const createSidebarLink = (item, currentPage) => {
	const link = document.createElement("a");
	const isActive = isActiveItem(item, currentPage);

	link.className = isActive ? "nav-item active" : "nav-item";
	link.href = item.href;

	if (item.id === "create-post") {
		link.classList.add("create-post-link");
	}

	// Icon chuông cho mục thông báo — bọc thêm badge số chưa đọc
	if (item.id === "notifications") {
		link.innerHTML = `
			<span class="nav-bell-wrap">
				<i class="bx ${item.icon}"></i>
				<span id="noti-count-badge" class="noti-badge is-hidden" aria-label="Số thông báo chưa đọc"></span>
			</span>
			<span class="nav-label">${item.label}</span>
		`;
	} else {
		link.innerHTML = `
			<i class="bx ${item.icon}"></i>
			<span class="nav-label">${item.label}</span>
		`;
	}

	return link;
};

const getVisibleSidebarItems = (userRole) => {
	const visibleManagementItems = SIDEBAR_MANAGEMENT_ITEMS.filter((item) => isVisibleForRole(item, userRole));
	return SIDEBAR_BASE_ITEMS.concat(visibleManagementItems);
};

// ---------------------------------------------------------------------------
// Sidebar HTML injection
// ---------------------------------------------------------------------------

/**
 * Tạo và inject phần tử <aside class="sidebar"> vào đầu .app-shell.
 * Nếu .app-shell không tồn tại, bỏ qua.
 */
const injectSidebarHTML = () => {
	const appShell = document.querySelector(".app-shell");
	if (!appShell) {
		return;
	}

	// Nếu sidebar đã có trong DOM (do server-side hoặc lần chạy trước), xóa đi
	const existing = appShell.querySelector(":scope > aside.sidebar");
	if (existing) {
		existing.remove();
	}

	const aside = document.createElement("aside");
	aside.className = "sidebar";

	const brand = document.createElement("h1");
	brand.className = "brand";
	brand.textContent = "DUTraveler";

	const nav = document.createElement("nav");
	nav.className = "side-nav";
	nav.setAttribute("aria-label", "Sidebar navigation");

	aside.appendChild(brand);
	aside.appendChild(nav);

	// Chèn sidebar vào đầu .app-shell (trước .main-content)
	appShell.insertBefore(aside, appShell.firstChild);
};

// ---------------------------------------------------------------------------
// Nav item rendering
// ---------------------------------------------------------------------------

const renderSideNavItems = (sideNav, items, currentPage) => {
	if (!sideNav) {
		return;
	}

	sideNav.innerHTML = "";

	items.forEach((item) => {
		sideNav.appendChild(createSidebarLink(item, currentPage));
	});
};

const syncSidebarItems = () => {
	const sideNavList = document.querySelectorAll(".side-nav");
	if (sideNavList.length === 0) {
		return;
	}

	const userRole = getCurrentUserRole();
	const currentPage = getCurrentPage();
	const visibleItems = getVisibleSidebarItems(userRole);

	sideNavList.forEach((sideNav) => {
		renderSideNavItems(sideNav, visibleItems, currentPage);
	});
};

// ---------------------------------------------------------------------------
// Unread notification count — Global logic
// ---------------------------------------------------------------------------

/** Tên file của trang Thông báo — dùng để bỏ qua gọi API khi đang ở trang này */
const NOTIFICATIONS_PAGE = "notifications.html";

/**
 * Kiểm tra trang hiện tại có phải trang Thông báo không.
 * Khi đang ở trang Thông báo, notifications.js đã gọi:
 *   - GET /api/notifications (lấy danh sách)
 *   - PATCH /api/notifications { isRead: true } (đánh dấu đã đọc)
 * → Không cần gọi thêm GET /api/notifications/unread-count (dư thừa).
 * @returns {boolean}
 */
const isNotificationsPage = () => getCurrentPage() === NOTIFICATIONS_PAGE;

/**
 * Cập nhật badge số thông báo chưa đọc trên icon chuông ở sidebar.
 *
 * Gọi API GET /api/notifications/unread-count và:
 *  - Nếu count > 0 → hiển thị số lên badge.
 *  - Nếu count = 0 → ẩn badge hoàn toàn.
 *
 * Hàm được export để tái sử dụng ở feed.js, comment-modal.js và các file khác.
 * Được tự động trigger khi:
 *  1. DOM load (mọi trang) — gọi bên trong initSidebar() để đảm bảo badge đã có.
 *  2. Window focus (tab được kích hoạt lại).
 *  3. Feed.js: khi mở comment-modal hoặc load thêm bài viết (gọi thủ công).
 *  4. comment-modal.js: sau khi gửi bình luận thành công.
 *
 * LƯU Ý: Hàm này phải được khai báo TRƯỚC initSidebar() để có thể gọi
 *         bên trong initSidebar(). Do đó toàn bộ phần khai báo hàm được
 *         đặt TRƯỚC khối bootstrap.
 */
export const updateUnreadNotificationCount = async () => {
	try {
		const response = await notificationApi.getUnreadCount();
		const count = Number(response?.data?.unreadCount ?? 0);

		// Tìm badge trong DOM
		const badge = document.getElementById("noti-count-badge");
		if (!badge) return;

		if (count > 0) {
			// Hiển thị số — giới hạn tối đa 99+
			badge.textContent = count > 99 ? "99+" : String(count);
			badge.classList.remove("is-hidden");
		} else {
			// Ẩn hoàn toàn khi không có thông báo chưa đọc
			badge.textContent = "";
			badge.classList.add("is-hidden");
		}
	} catch (error) {
		// Thất bại thầm lặng — không làm gián đoạn UX
		console.warn("[sidebar] Không thể lấy số thông báo chưa đọc:", error);
	}
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const initSidebar = () => {
	injectSidebarHTML();   // 1. Tạo <aside> và inject #noti-count-badge vào DOM
	syncSidebarItems();    // 2. Render các nav-item (đồng bộ)

	// 3. Sau khi badge đã có trong DOM, lấy số thông báo chưa đọc từ API.
	//    Bỏ qua khi đang ở trang Thông báo: trang đó đã gọi PATCH markAllAsRead(),
	//    nên unread count lúc này chắc chắn = 0 và badge không cần cập nhật.
	if (!isNotificationsPage()) {
		void updateUnreadNotificationCount();
	}
};

export const refreshSidebarItems = syncSidebarItems;

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initSidebar);
} else {
	// DOM đã sẵn sàng (ES module luôn defer, nên thường rơi vào đây)
	initSidebar();
}

// Trigger 2: Khi người dùng quay lại tab trình duyệt.
// Bỏ qua nếu đang ở trang Thông báo (lý do tương tự như trên).
window.addEventListener("focus", () => {
	if (!isNotificationsPage()) {
		void updateUnreadNotificationCount();
	}
});
