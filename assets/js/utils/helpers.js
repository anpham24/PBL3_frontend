"use strict";

export const toArray = (iterable) => Array.from(iterable || []);

export const toSafeString = (value, fallback = "") => {
	if (typeof value === "string") {
		const trimmedValue = value.trim();
		return trimmedValue.length > 0 ? trimmedValue : fallback;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}

	return fallback;
};

export const toSafeId = (value, fallback) => toSafeString(value, fallback);

export const toBoolean = (value) => Boolean(value);

/**
 * Kiểm tra xem người dùng hiện tại có phải chủ sở hữu của bài đăng không.
 * So sánh `userId` từ localStorage với `authorId` của bài đăng.
 *
 * @param {string|null|undefined} authorId - ID của tác giả bài đăng từ API.
 * @returns {boolean} true nếu người dùng đang đăng nhập là tác giả, false trong mọi trường hợp còn lại.
 */
export const isPostOwner = (authorId) => {
	try {
		const currentUserId = (localStorage.getItem("userId") ?? "").trim();
		const safeAuthorId = (typeof authorId === "string" ? authorId : "").trim();
		return currentUserId.length > 0 && safeAuthorId.length > 0 && currentUserId === safeAuthorId;
	} catch {
		// localStorage bị chặn (private mode, browser restriction) → không phải chủ sở hữu
		return false;
	}
};
