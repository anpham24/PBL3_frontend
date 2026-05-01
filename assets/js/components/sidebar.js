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

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", syncSidebarItems);
} else {
	syncSidebarItems();
}
