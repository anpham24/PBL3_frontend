"use strict";

const currentUserRole = localStorage.getItem("userRole");
if (currentUserRole !== "ADMIN") {
	window.location.href = "feed.html";
}

const mockUsers = [
	{
		id: 1,
		avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=60",
		username: "duyen.travels",
		nickname: "Duyen Travel",
		email: "duyen.travel@example.com",
		role: "MEMBER"
	},
	{
		id: 2,
		avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=96&q=60",
		username: "son.wander",
		nickname: "Son Wander",
		email: "son.wander@example.com",
		role: "MEMBER"
	},
	{
		id: 3,
		avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=96&q=60",
		username: "annie.go",
		nickname: "Annie Go",
		email: "annie.go@example.com",
		role: "MODERATOR"
	},
	{
		id: 4,
		avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=96&q=60",
		username: "admin.super",
		nickname: "Super Admin",
		email: "admin.super@example.com",
		role: "ADMIN"
	}
];

let usersState = [];
let usersTableBody;
let usersCountBadge;
let usersEmptyState;

const escapeHtml = (value) => {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#039;");
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

async function fetchUsers() {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve(mockUsers);
		}, 350);
	});
}

const updateUsersCountBadge = () => {
	if (!usersCountBadge) {
		return;
	}

	usersCountBadge.textContent = `${usersState.length} người dùng`;
};

const updateEmptyState = () => {
	if (!usersEmptyState) {
		return;
	}

	usersEmptyState.classList.toggle("is-hidden", usersState.length > 0);
};

const createUserRowHtml = (user, index) => {
	const safeRole = escapeHtml(user.role);

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
				<span class="role-badge ${getRoleClassName(user.role)}">${safeRole}</span>
			</td>
			<td class="actions-cell">
				<button class="delete-user-btn" type="button" data-user-id="${escapeHtml(user.id)}">
					<i class="bx bx-trash"></i>
					<span>Xóa người dùng</span>
				</button>
			</td>
		</tr>
	`;
};

const renderUsers = () => {
	if (!usersTableBody) {
		return;
	}

	usersTableBody.innerHTML = usersState.map((user, index) => createUserRowHtml(user, index)).join("");
	updateUsersCountBadge();
	updateEmptyState();
};

function deleteUser(userId) {
	const confirmed = window.confirm("Bạn có chắc chắn muốn xóa người dùng này?");
	if (!confirmed) {
		return;
	}

	usersState = usersState.filter((user) => String(user.id) !== String(userId));
	renderUsers();
}

const attachDeleteHandler = () => {
	if (!usersTableBody) {
		return;
	}

	usersTableBody.addEventListener("click", (event) => {
		const deleteButton = event.target.closest(".delete-user-btn");
		if (!deleteButton) {
			return;
		}

		const userId = deleteButton.dataset.userId;
		if (!userId) {
			return;
		}

		deleteUser(userId);
	});
};

const initUsersPage = async () => {
	usersTableBody = document.getElementById("users-tbody");
	usersCountBadge = document.getElementById("users-count-badge");
	usersEmptyState = document.getElementById("users-empty-state");

	if (!usersTableBody) {
		return;
	}

	attachDeleteHandler();

	try {
		usersState = await fetchUsers();
		renderUsers();
	} catch (error) {
		console.error("Không thể tải danh sách người dùng:", error);
		usersState = [];
		renderUsers();
	}
};

if (currentUserRole === "ADMIN") {
	document.addEventListener("DOMContentLoaded", initUsersPage);
}
