"use strict";

import { userApi } from "../api/user-api.js";
import { getCurrentUser } from "../utils/auth.js";
import { initCreatePostModal } from "../components/create-post-modal.js";

const ADMIN_ROLE = "ADMIN";
const SEARCH_DEBOUNCE_MS = 320;
const DEFAULT_AVATAR_URL =
	"https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=60";

const usersState = {
	users: [],
	keyword: "",
	requestSequence: 0
};

let searchDebounceTimer = 0;
let usersTableBody;
let usersCountBadge;
let usersEmptyState;
let usersSearchInput;
let usersStatus;
let confirmModal;
let confirmTitle;
let confirmMessage;
let confirmAcceptButton;
let confirmCancelButton;

const escapeHtml = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const safeText = (value) => {
	if (typeof value !== "string") {
		return "";
	}

	return value.trim();
};

const toMessage = (error, fallbackMessage) => {
	if (typeof error?.data?.message === "string" && error.data.message.trim().length > 0) {
		return error.data.message.trim();
	}

	if (typeof error?.message === "string" && error.message.trim().length > 0) {
		return error.message.trim();
	}

	return fallbackMessage;
};

const getCurrentUserRole = () => {
	const currentUser = getCurrentUser();
	if (currentUser && typeof currentUser.userRole === "string") {
		return currentUser.userRole.trim().toUpperCase();
	}
	return "";
};

const setStatus = (message, variant = "info") => {
	if (!usersStatus) {
		return;
	}

	usersStatus.textContent = message;
	usersStatus.classList.toggle("is-hidden", safeText(message).length === 0);

	if (variant === "error") {
		usersStatus.style.color = "#b91c16";
		return;
	}

	if (variant === "success") {
		usersStatus.style.color = "#15803d";
		return;
	}

	usersStatus.style.color = "#4b5563";
};

const clearStatus = () => {
	setStatus("");
	if (usersStatus) {
		usersStatus.style.color = "";
	}
};

const getRoleClassName = (role) => {
	if (role === "ADMIN") {
		return "role-admin";
	}

	if (role === "MODERATOR") {
		return "role-moderator";
	}

	return "role-member";
};

const resolveUsersPayload = (response) => {
	if (Array.isArray(response?.data?.users)) {
		return response.data.users;
	}

	if (Array.isArray(response?.data?.items)) {
		return response.data.items;
	}

	if (Array.isArray(response?.data)) {
		return response.data;
	}

	return [];
};

const normalizeUser = (user, index) => {
	const role = safeText(user?.role || "MEMBER").toUpperCase();

	return {
		id: safeText(user?.id ? String(user.id) : "") || `user-${index + 1}`,
		avatar: safeText(user?.avatar || user?.avatar_url || user?.avt_url) || DEFAULT_AVATAR_URL,
		username: safeText(user?.username) || "user",
		nickname: safeText(user?.nickname) || "",
		email: safeText(user?.email) || "",
		role: role.length > 0 ? role : "MEMBER",
		isBlocked: Boolean(user?.is_blocked || user?.blocked || user?.status === "BLOCKED")
	};
};

const escapeSelectorValue = (value) => {
	const safeValue = safeText(value);

	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(safeValue);
	}

	return safeValue.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
};

const updateUsersCountBadge = () => {
	if (!usersCountBadge) {
		return;
	}

	usersCountBadge.textContent = `${usersState.users.length} người dùng`;
};

const updateEmptyState = () => {
	if (!usersEmptyState) {
		return;
	}

	usersEmptyState.classList.toggle("is-hidden", usersState.users.length > 0);
};

const createUserRowHtml = (user, index) => {
	const roleClassName = getRoleClassName(user.role);
	const blockButtonLabel = user.isBlocked ? "Đã khóa" : "Khóa tài khoản";
	const blockDisabled = user.isBlocked ? "disabled" : "";

	return `
		<tr data-user-id="${escapeHtml(user.id)}">
			<td class="stt-cell">${index + 1}</td>
			<td class="avatar-cell">
				<img class="user-avatar-thumb" src="${escapeHtml(user.avatar)}" alt="Avatar ${escapeHtml(user.username)}">
			</td>
			<td>${escapeHtml(user.username)}</td>
			<td>${escapeHtml(user.nickname)}</td>
			<td class="email-cell">${escapeHtml(user.email)}</td>
			<td>
				<span class="role-badge ${roleClassName}">${escapeHtml(user.role)}</span>
			</td>
			<td class="actions-cell">
				<div class="user-actions">
					<button class="user-action-btn block-user-btn" type="button" data-action="block" data-user-id="${escapeHtml(user.id)}" ${blockDisabled}>
						<i class="bx bx-lock-alt"></i>
						<span>${escapeHtml(blockButtonLabel)}</span>
					</button>
					<button class="user-action-btn delete-user-btn" type="button" data-action="delete" data-user-id="${escapeHtml(user.id)}">
						<i class="bx bx-trash"></i>
						<span>Xóa người dùng</span>
					</button>
				</div>
			</td>
		</tr>
	`;
};

const renderUsers = () => {
	if (!usersTableBody) {
		return;
	}

	usersTableBody.innerHTML = usersState.users.map((user, index) => createUserRowHtml(user, index)).join("");
	updateUsersCountBadge();
	updateEmptyState();
};

const toggleConfirmModal = (isOpen) => {
	if (!confirmModal) {
		return;
	}

	confirmModal.classList.toggle("is-hidden", !isOpen);
	confirmModal.setAttribute("aria-hidden", isOpen ? "false" : "true");
	document.body.style.overflow = isOpen ? "hidden" : "";
};

const openConfirmModal = ({ title, message, acceptText }) => {
	return new Promise((resolve) => {
		if (!confirmModal || !confirmAcceptButton || !confirmCancelButton || !confirmTitle || !confirmMessage) {
			resolve(false);
			return;
		}

		confirmTitle.textContent = title;
		confirmMessage.textContent = message;
		confirmAcceptButton.textContent = acceptText;

		const close = (accepted) => {
			toggleConfirmModal(false);
			confirmAcceptButton.removeEventListener("click", onAccept);
			confirmCancelButton.removeEventListener("click", onCancel);
			confirmModal.removeEventListener("click", onOverlayClick);
			document.removeEventListener("keydown", onEscapePress);
			resolve(accepted);
		};

		const onAccept = () => close(true);
		const onCancel = () => close(false);
		const onOverlayClick = (event) => {
			if (event.target === confirmModal) {
				close(false);
			}
		};
		const onEscapePress = (event) => {
			if (event.key === "Escape") {
				close(false);
			}
		};

		confirmAcceptButton.addEventListener("click", onAccept);
		confirmCancelButton.addEventListener("click", onCancel);
		confirmModal.addEventListener("click", onOverlayClick);
		document.addEventListener("keydown", onEscapePress);

		toggleConfirmModal(true);
	});
};

const setButtonsDisabled = (userId, disabled) => {
	if (!usersTableBody) {
		return;
	}

	const selector = `[data-user-id="${escapeSelectorValue(userId)}"]`;
	const row = usersTableBody.querySelector(selector);
	if (!row) {
		return;
	}

	row.querySelectorAll("button[data-action]").forEach((button) => {
		button.disabled = disabled;
	});
};

const loadUsers = async (keyword = "") => {
	const resolvedKeyword = safeText(keyword);
	usersState.keyword = resolvedKeyword;

	const requestId = ++usersState.requestSequence;
	setStatus("Đang tải danh sách người dùng...");

	try {
		const response = await userApi.getUsers(resolvedKeyword);

		if (requestId !== usersState.requestSequence) {
			return;
		}

		usersState.users = resolveUsersPayload(response).map(normalizeUser);
		renderUsers();

		if (usersState.users.length === 0) {
			setStatus(
				resolvedKeyword.length > 0
					? "Không tìm thấy người dùng phù hợp từ khóa."
					: "Không có người dùng nào được hiển thị."
			);
			return;
		}

		clearStatus();
	} catch (error) {
		if (requestId !== usersState.requestSequence) {
			return;
		}

		usersState.users = [];
		renderUsers();
		setStatus(toMessage(error, "Không thể tải danh sách người dùng."), "error");
	}
};

const blockUser = async (userId) => {
	const targetUser = usersState.users.find((user) => user.id === userId);
	if (!targetUser) {
		return;
	}

	const accepted = await openConfirmModal({
		title: "Khóa tài khoản",
		message: `Bạn có chắc chắn muốn khóa tài khoản ${targetUser.username}?`,
		acceptText: "Khóa"
	});

	if (!accepted) {
		return;
	}

	setButtonsDisabled(userId, true);
	setStatus("Đang khóa tài khoản...");

	try {
		await userApi.blockUser(userId);
		usersState.users = usersState.users.map((user) =>
			user.id === userId
				? {
					...user,
					isBlocked: true
				}
				: user
		);
		renderUsers();
		setStatus("Đã khóa tài khoản thành công.", "success");
	} catch (error) {
		setButtonsDisabled(userId, false);
		setStatus(toMessage(error, "Không thể khóa tài khoản."), "error");
	}
};

const deleteUser = async (userId) => {
	const targetUser = usersState.users.find((user) => user.id === userId);
	if (!targetUser) {
		return;
	}

	const accepted = await openConfirmModal({
		title: "Xóa người dùng",
		message: `Bạn có chắc chắn muốn xóa người dùng ${targetUser.username}?`,
		acceptText: "Xóa"
	});

	if (!accepted) {
		return;
	}

	setButtonsDisabled(userId, true);
	setStatus("Đang xóa người dùng...");

	try {
		await userApi.deleteUser(userId);
		usersState.users = usersState.users.filter((user) => user.id !== userId);
		renderUsers();
		setStatus("Đã xóa người dùng thành công.", "success");
	} catch (error) {
		setButtonsDisabled(userId, false);
		setStatus(toMessage(error, "Không thể xóa người dùng."), "error");
	}
};

const handleUserTableClick = (event) => {
	const actionButton = event.target.closest("button[data-action]");
	if (!actionButton || !usersTableBody?.contains(actionButton)) {
		return;
	}

	const action = safeText(actionButton.dataset.action);
	const userId = safeText(actionButton.dataset.userId);
	if (userId.length === 0) {
		return;
	}

	if (action === "block") {
		void blockUser(userId);
	}

	if (action === "delete") {
		void deleteUser(userId);
	}
};

const handleSearchInput = () => {
	const keyword = safeText(usersSearchInput?.value);

	window.clearTimeout(searchDebounceTimer);
	searchDebounceTimer = window.setTimeout(() => {
		void loadUsers(keyword);
	}, SEARCH_DEBOUNCE_MS);
};

const handleSearchEnter = (event) => {
	if (event.key !== "Enter") {
		return;
	}

	event.preventDefault();
	window.clearTimeout(searchDebounceTimer);
	void loadUsers(safeText(usersSearchInput?.value));
};

const initUsersPage = async () => {
	if (getCurrentUserRole() !== ADMIN_ROLE) {
		window.location.href = "feed.html";
		return;
	}

	usersTableBody = document.getElementById("users-tbody");
	usersCountBadge = document.getElementById("users-count-badge");
	usersEmptyState = document.getElementById("users-empty-state");
	usersSearchInput = document.getElementById("users-search-input");
	usersStatus = document.getElementById("users-status");
	confirmModal = document.getElementById("users-confirm-modal");
	confirmTitle = document.getElementById("users-confirm-title");
	confirmMessage = document.getElementById("users-confirm-message");
	confirmAcceptButton = document.getElementById("users-confirm-accept");
	confirmCancelButton = document.getElementById("users-confirm-cancel");

	if (!usersTableBody) {
		return;
	}

	usersTableBody.addEventListener("click", handleUserTableClick);
	usersSearchInput?.addEventListener("input", handleSearchInput);
	usersSearchInput?.addEventListener("keydown", handleSearchEnter);

	initCreatePostModal();
	await loadUsers("");
};

document.addEventListener("DOMContentLoaded", initUsersPage);