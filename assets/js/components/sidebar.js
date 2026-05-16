"use strict";

import { getCurrentUser } from "../utils/auth.js";

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
	const user = getCurrentUser();
	const userRole = normalizeRole(user?.userRole || "");
	if (userRole.length > 0) {
		return userRole;
	}

	return "";
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

	link.innerHTML = `
		<i class="bx ${item.icon}"></i>
		<span class="nav-label">${item.label}</span>
	`;

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
// Bootstrap
// ---------------------------------------------------------------------------

const initSidebar = () => {
	injectSidebarHTML();
	syncSidebarItems();
};

export const refreshSidebarItems = syncSidebarItems;

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initSidebar);
} else {
	initSidebar();
}
