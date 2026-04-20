"use strict";

import { apiClient } from "./api-client.js";

const normalizeValue = (value) => {
	if (typeof value !== "string") {
		return "";
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : "";
};

const buildFeedUrl = (lastId, provinceCode, topicCode) => {
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
		return apiClient.get(buildFeedUrl(lastId, provinceCode, topicCode));
	}
};
