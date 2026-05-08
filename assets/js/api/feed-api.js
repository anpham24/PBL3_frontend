"use strict";

import { apiClient } from "./api-client.js";

const normalizeValue = (value) => {
	if (typeof value !== "string") {
		return "";
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : "";
};

const buildFeedQueryString = (lastId, provinceCode, topicCode, feedType) => {
	const params = new URLSearchParams();

	const safeLastId = normalizeValue(lastId);
	const safeProvinceCode = normalizeValue(provinceCode);
	const safeTopicCode = normalizeValue(topicCode);

	if (safeLastId.length > 0) {
		params.set("lastPostId", safeLastId);
	}

	if (safeProvinceCode.length > 0) {
		params.set("provinceCode", safeProvinceCode);
	}

	if (safeTopicCode.length > 0) {
		params.set("topicCode", safeTopicCode);
	}

	if (typeof feedType === "string" && feedType.trim().length > 0) {
		params.set("feedType", feedType.trim());
	}

	return params.toString();
};

const buildFeedUrl = (lastId, provinceCode, topicCode, feedType) => {
	const queryString = buildFeedQueryString(lastId, provinceCode, topicCode, feedType);
	return queryString.length > 0 ? `/api/posts?${queryString}` : "/api/posts";
};

export const feedApi = {
	async getDropdownData() {
		return apiClient.get("/api/master-data", {
			requiresAuth: false,
			skipAuthRedirect: true
		});
	},

	async getFeed(lastId, provinceCode, topicCode) {
		return apiClient.get(buildFeedUrl(lastId, provinceCode, topicCode, ""));
	},

	async getExploreFeed(lastId, provinceCode, topicCode) {
		return apiClient.get(buildFeedUrl(lastId, provinceCode, topicCode, "EXPLORE"));
	},

	async getFollowingFeed(lastId, provinceCode, topicCode) {
		return apiClient.get(buildFeedUrl(lastId, provinceCode, topicCode, "FOLLOWING"));
	}
};
