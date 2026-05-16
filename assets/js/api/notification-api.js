"use strict";

import { apiClient } from "./api-client.js";

const normalizeId = (id) => {
    if (typeof id !== "string" && typeof id !== "number") {
        return "";
    }
    const safeId = String(id).trim();
    return safeId.length > 0 ? safeId : "";
};

export const notificationApi = {
    async getNotifications() {
        return apiClient.get("/api/notifications");
    },

    async markAsRead(notificationId) {
        const resolvedId = normalizeId(notificationId);
        if (resolvedId.length === 0) {
            throw new Error("Thiếu ID thông báo hợp lệ.");
        }

        // Dựa vào code Java của bạn: req.getParameter("id")
        return apiClient.put(`/api/notifications/read?id=${encodeURIComponent(resolvedId)}`);
    }
};