"use strict";

import { userApi } from "../api/user-api.js";
import { initCommentModal } from "./comment-modal.js";
import { initCreatePostModal } from "./create-post-modal.js";
import { initPostInteractions } from "./post-interactions.js";

const DEFAULT_AVATAR_URL =
	"https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=520&q=70";

const toMessage = (error, fallbackMessage) => {
	if (typeof error?.data?.message === "string" && error.data.message.trim().length > 0) {
		return error.data.message.trim();
	}

	if (typeof error?.message === "string" && error.message.trim().length > 0) {
		return error.message.trim();
	}

	return fallbackMessage;
};

const safeText = (value, fallback = "") => {
	if (typeof value !== "string") {
		return fallback;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : fallback;
};

const safeCount = (value) => {
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}

	if (typeof value === "string") {
		const trimmedValue = value.trim();
		if (trimmedValue.length > 0) {
			return trimmedValue;
		}
	}

	return "0";
};

const setFeedback = (feedbackElement, message, variant) => {
	if (!feedbackElement) {
		return;
	}

	feedbackElement.textContent = message;
	feedbackElement.classList.remove("is-hidden", "is-error", "is-success");
	feedbackElement.classList.add(variant === "error" ? "is-error" : "is-success");
};

const clearFeedback = (feedbackElement) => {
	if (!feedbackElement) {
		return;
	}

	feedbackElement.textContent = "";
	feedbackElement.classList.add("is-hidden");
	feedbackElement.classList.remove("is-error", "is-success");
};

const getTargetUserIdFromQuery = () => {
	const query = new URLSearchParams(window.location.search);
	return safeText(query.get("id"));
};

const renderProfile = (response) => {
	const user = response?.data?.user;

	if (!user) {
		throw new Error("Khong tim thay thong tin nguoi dung.");
	}

	const avatarElement = document.getElementById("profile-avatar");
	const nicknameElement = document.getElementById("profile-nickname");
	const bioElement = document.getElementById("profile-bio");
	const postsCountElement = document.getElementById("profile-posts-count");
	const followersCountElement = document.getElementById("profile-followers-count");
	const followingCountElement = document.getElementById("profile-following-count");
	const followButton = document.getElementById("profile-follow-button");
	const linkElement = document.getElementById("profile-link");

	const nickname = safeText(user.nickname, "Nguoi dung");
	const avatar = safeText(user.avatar, DEFAULT_AVATAR_URL);
	const bio = safeText(user.bio, "Chua cap nhat bio.");
	const website = safeText(user.website || user.link);

	if (avatarElement) {
		avatarElement.src = avatar;
		avatarElement.alt = `Avatar ${nickname}`;
	}

	if (nicknameElement) {
		nicknameElement.textContent = nickname;
	}

	if (bioElement) {
		bioElement.textContent = bio;
	}

	if (postsCountElement) {
		postsCountElement.textContent = safeCount(user.postsCount);
	}

	if (followersCountElement) {
		followersCountElement.textContent = safeCount(user.followersCount);
	}

	if (followingCountElement) {
		followingCountElement.textContent = safeCount(user.followingCount);
	}

	if (linkElement) {
		if (website.length > 0) {
			linkElement.textContent = website;
			linkElement.href = website;
			linkElement.classList.remove("is-hidden");
		} else {
			linkElement.textContent = "";
			linkElement.href = "#";
			linkElement.classList.add("is-hidden");
		}
	}

	if (followButton) {
		const viewingOtherProfile = getTargetUserIdFromQuery().length > 0;

		if (!viewingOtherProfile) {
			followButton.classList.add("is-hidden");
		} else {
			const isFollowing = Boolean(response?.data?.isFollowing);
			followButton.classList.remove("is-hidden");
			followButton.classList.toggle("is-following", isFollowing);
			followButton.textContent = isFollowing ? "Following" : "Follow";
			followButton.disabled = true;
		}
	}
};

const loadProfileData = async () => {
	const feedbackElement = document.getElementById("profile-feedback");
	clearFeedback(feedbackElement);

	try {
		const targetUserId = getTargetUserIdFromQuery();
		const response =
			targetUserId.length > 0
				? await userApi.getProfileById(targetUserId)
				: await userApi.getMyProfile();

		renderProfile(response);
	} catch (error) {
		setFeedback(feedbackElement, toMessage(error, "Khong the tai thong tin ho so."), "error");
	}
};

const initProfilePage = () => {
	initCreatePostModal();
	initCommentModal(".profile-grid .grid-item");
	initPostInteractions();
	loadProfileData();
};

document.addEventListener("DOMContentLoaded", initProfilePage);
