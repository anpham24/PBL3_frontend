"use strict";

import { notificationApi } from "../api/notification-api.js";
import { postApi } from "../api/post-api.js";
import { initCreatePostModal } from "../components/create-post-modal.js";
import { initCommentModal } from "../components/comment-modal.js";
import { initPostInteractions } from "../components/post-interactions.js";

const DEFAULT_AVATAR_URL = "../assets/images/225-default-avatar.png";

let notificationsListElement;
let notificationsEmptyStateElement;
let notificationsStatusElement;
let commentModalController;

const safeText = (value, fallback = "") => {
	if (typeof value !== "string") {
		return fallback;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : fallback;
};

const escapeHtml = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#039;");

const timeAgo = (dateString) => {
	if (!dateString) return "";
	const date = new Date(dateString);
	if (isNaN(date.getTime())) return "";

	const seconds = Math.floor((new Date() - date) / 1000);
	if (seconds < 0) return "Vừa xong";

	let interval = seconds / 31536000;
	if (interval >= 1) return Math.floor(interval) + " năm trước";

	interval = seconds / 2592000;
	if (interval >= 1) return Math.floor(interval) + " tháng trước";

	interval = seconds / 86400;
	if (interval >= 1) return Math.floor(interval) + " ngày trước";

	interval = seconds / 3600;
	if (interval >= 1) return Math.floor(interval) + " giờ trước";

	interval = seconds / 60;
	if (interval >= 1) return Math.floor(interval) + " phút trước";

	return "Vừa xong";
};

const setStatus = (message, variant = "info") => {
	if (!notificationsStatusElement) return;

	notificationsStatusElement.textContent = message;
	notificationsStatusElement.classList.toggle("is-hidden", safeText(message).length === 0);

	if (variant === "error") {
		notificationsStatusElement.style.color = "#dc2626";
	} else if (variant === "success") {
		notificationsStatusElement.style.color = "#15803d";
	} else {
		notificationsStatusElement.style.color = "#4b5563";
	}
};

const clearStatus = () => setStatus("");

const syncEmptyState = (hasItems) => {
	if (!notificationsEmptyStateElement) return;
	notificationsEmptyStateElement.classList.toggle("is-hidden", hasItems);
};

const resolveNotificationType = (type, actorName) => {
	const safeType = safeText(type).toUpperCase();
	const safeName = `<strong>${escapeHtml(actorName)}</strong>`;

	switch (safeType) {
		case "LIKE_POST":
			return {
				icon: '<i class="bx bxs-heart"></i>',
				badgeClass: "like-badge",
				text: `${safeName} đã thích bài viết của bạn.`
			};
		case "COMMENT":
			return {
				icon: '<i class="bx bxs-message-rounded-dots"></i>',
				badgeClass: "comment-badge",
				text: `${safeName} đã bình luận về bài viết của bạn.`
			};
		case "FOLLOW":
			return {
				icon: '<i class="bx bxs-user"></i>',
				badgeClass: "follow-badge",
				text: `${safeName} đã bắt đầu theo dõi bạn.`
			};
		case "NEW_POST":
			return {
				icon: '<i class="bx bxs-bell-ring"></i>',
				badgeClass: "post-badge",
				text: `${safeName} vừa đăng một bài viết mới.`
			};
		default:
			return {
				icon: '<i class="bx bx-bell"></i>',
				badgeClass: "",
				text: `Bạn có thông báo mới từ ${safeName}.`
			};
	}
};

const createNotificationItemHtml = (noti) => {
	const id = safeText(noti.id);
	const isRead = Boolean(noti.isRead || noti.is_read);

	const actorDisplayName = safeText(noti.actorNickname) || safeText(noti.actorUsername) || "Người dùng";
	const typeConfig = resolveNotificationType(noti.type, actorDisplayName);
	const avatarUrl = safeText(noti.actorAvatar, DEFAULT_AVATAR_URL);
	const timeText = timeAgo(noti.createdAt || noti.created_at);

	const notiType = safeText(noti.type).toUpperCase();
	const targetId = safeText(noti.targetId);
	const actorId = safeText(noti.actorId);

	let targetLink = "#";
	let rightSideHtml = "";

	if (notiType === "FOLLOW") {
		targetLink = `profile.html?id=${escapeHtml(actorId)}`;
		rightSideHtml = `<button class="following-btn" type="button" data-action="view-profile" data-target="${escapeHtml(actorId)}">Xem hồ sơ</button>`;
	}

	// TRUYỀN DỮ LIỆU VÀO CÁC DATA ATTRIBUTE ĐỂ CLICK JS DỄ DÀNG ĐỌC VÀ BẬT MODAL
	return `
		<div class="notification-item ${isRead ? "is-read" : "is-unread"}" 
			data-id="${escapeHtml(id)}" 
			data-href="${escapeHtml(targetLink)}"
			data-target-id="${escapeHtml(targetId)}"
			data-noti-type="${escapeHtml(notiType)}"
			data-actor-id="${escapeHtml(actorId)}"
			style="cursor: pointer;">
			<div class="notification-user">
				<img class="notification-avatar" src="${escapeHtml(avatarUrl)}" alt="Avatar">
				<span class="notification-badge ${typeConfig.badgeClass}" aria-hidden="true">
					${typeConfig.icon}
				</span>
			</div>
			<div class="notification-content">
				<p>${typeConfig.text}</p>
				<span class="notification-time">${escapeHtml(timeText)}</span>
			</div>
			${rightSideHtml}
			${!isRead ? `<div class="unread-dot" aria-label="Chưa đọc"></div>` : ""}
		</div>
	`;
};

const renderNotifications = (notifications) => {
	if (!notificationsListElement) return;

	if (!Array.isArray(notifications) || notifications.length === 0) {
		notificationsListElement.innerHTML = "";
		syncEmptyState(false);
		return;
	}

	notificationsListElement.innerHTML = notifications.map(createNotificationItemHtml).join("");
	syncEmptyState(true);
};

const loadNotifications = async () => {
	setStatus("Đang tải thông báo...");
	try {
		const response = await notificationApi.getNotifications();
		const list = Array.isArray(response?.data?.notifications)
			? response.data.notifications
			: (Array.isArray(response?.data) ? response.data : []);

		renderNotifications(list);
		clearStatus();
	} catch (error) {
		const fallback = "Không thể tải danh sách thông báo. Vui lòng thử lại.";
		const msg = typeof error?.message === "string" ? error.message : fallback;
		setStatus(msg, "error");
		syncEmptyState(false);
	}
};

const handleNotificationClick = async (event) => {
	const notiItem = event.target.closest(".notification-item");
	if (!notiItem) return;

	const id = safeText(notiItem.dataset.id);
	const href = safeText(notiItem.dataset.href);
	const targetId = safeText(notiItem.dataset.targetId);
	const notiType = safeText(notiItem.dataset.notiType);
	const actorId = safeText(notiItem.dataset.actorId);

	// Nút Xem hồ sơ
	const btn = event.target.closest('button[data-action="view-profile"]');
	if (btn) {
		event.preventDefault();
		event.stopPropagation();
		window.location.href = `profile.html?id=${escapeHtml(safeText(btn.dataset.target))}`;
		return;
	}

	// Đánh dấu đã đọc ngầm dưới nền
	if (notiItem.classList.contains("is-unread")) {
		try {
			await notificationApi.markAsRead(id);
			notiItem.classList.remove("is-unread");
			notiItem.classList.add("is-read");
			const dot = notiItem.querySelector(".unread-dot");
			if (dot) dot.remove();
		} catch (error) {
			console.warn("Lỗi khi đánh dấu đã đọc:", error);
		}
	}

	// NẾU LÀ THÔNG BÁO VỀ BÀI VIẾT (Có targetId) -> BẬT MODAL LÊN
	if (targetId.length > 0 && commentModalController) {
		event.preventDefault();
		try {
			// Bạn có thể thêm class loading cho thông báo tại đây nếu muốn
			notiItem.style.opacity = "0.7";

			// Gọi API lấy thông tin post
			const response = await postApi.getPostById(targetId);
			const postData = response?.data?.post || response?.data; // Tùy cấu trúc trả về

			if (postData) {
				// Nếu là bình luận, đánh dấu tác giả để đóng khung xanh
				if (notiType === "COMMENT" && actorId.length > 0) {
					postData.highlightActorId = actorId;
				}
				// Mở Modal
				commentModalController.open(postData);
			} else {
				alert("Không tìm thấy bài viết. Có thể bài viết đã bị xóa.");
			}
		} catch (error) {
			console.error(error);
			alert("Bài viết không tồn tại hoặc đã bị xóa!");
		} finally {
			notiItem.style.opacity = "1";
		}
		return;
	}

	// Nếu là Follow thì mới chuyển hướng
	if (href !== "#") {
		window.location.href = href;
	}
};

const initNotificationsPage = () => {
	// Khởi tạo các Modal để trang này có cấu trúc DOM bật Popup
	initCreatePostModal();
	commentModalController = initCommentModal();
	initPostInteractions(); // Kích hoạt chức năng like, report bên trong modal

	notificationsListElement = document.querySelector(".notifications-list");
	const mainInner = document.querySelector(".notifications-page");

	if (mainInner && !document.getElementById("notifications-empty-state")) {
		mainInner.insertAdjacentHTML("beforeend", `
			<div id="notifications-status" class="is-hidden" style="text-align: center; margin-top: 20px;"></div>
			<div id="notifications-empty-state" class="is-hidden" style="text-align: center; margin-top: 40px; color: #6b7280;">
				<i class="bx bx-bell-off" style="font-size: 3rem; margin-bottom: 10px;"></i>
				<p>Bạn chưa có thông báo nào.</p>
			</div>
		`);
	}

	notificationsEmptyStateElement = document.getElementById("notifications-empty-state");
	notificationsStatusElement = document.getElementById("notifications-status");

	if (notificationsListElement) {
		notificationsListElement.addEventListener("click", handleNotificationClick);
	}

	void loadNotifications();
};

document.addEventListener("DOMContentLoaded", initNotificationsPage);