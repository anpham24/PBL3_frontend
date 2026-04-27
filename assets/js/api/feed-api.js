"use strict";

import { apiClient } from "./api-client.js";

const normalizeValue = (value) => {
	if (typeof value !== "string") {
		return "";
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : "";
};

const buildFeedQueryString = (lastId, provinceCode, topicCode) => {
	const params = new URLSearchParams();

	const safeLastId = normalizeValue(lastId);
	const safeProvinceCode = normalizeValue(provinceCode);
	const safeTopicCode = normalizeValue(topicCode);

	if (safeLastId.length > 0) {
		params.set("last_id", safeLastId);
	}

	if (safeProvinceCode.length > 0) {
		params.set("province_code", safeProvinceCode);
	}

	if (safeTopicCode.length > 0) {
		params.set("topic_code", safeTopicCode);
	}

	return params.toString();
};

const buildFeedUrl = (basePath, lastId, provinceCode, topicCode) => {
	const queryString = buildFeedQueryString(lastId, provinceCode, topicCode);
	return queryString.length > 0 ? `${basePath}?${queryString}` : basePath;
};

const buildFallbackFeedUrl = (feedMode, lastId, provinceCode, topicCode) => {
	const params = new URLSearchParams(buildFeedQueryString(lastId, provinceCode, topicCode));
	params.set("feed_mode", feedMode);

	const queryString = params.toString();
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
		return apiClient.get(buildFeedUrl("/api/posts", lastId, provinceCode, topicCode));
	},

	async getExploreFeed(lastId, provinceCode, topicCode) {
		try {
			return await apiClient.get(buildFeedUrl("/api/posts/explore", lastId, provinceCode, topicCode));
		} catch (error) {
			if (Number(error?.status) !== 404) {
				throw error;
			}

			return apiClient.get(buildFallbackFeedUrl("EXPLORE", lastId, provinceCode, topicCode));
		}
	},

	async getFollowingFeed(lastId, provinceCode, topicCode) {
		try {
			return await apiClient.get(buildFeedUrl("/api/posts/following", lastId, provinceCode, topicCode));
		} catch (error) {
			if (Number(error?.status) !== 404) {
				throw error;
			}

			return apiClient.get(buildFallbackFeedUrl("FOLLOWING", lastId, provinceCode, topicCode));
		}
	}
};
