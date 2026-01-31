package com.example.linknavigator.data

import com.google.gson.annotations.SerializedName

/**
 * API响应数据模型
 */
data class ApiResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("links")
    val links: List<Link>?
)
