package com.example.linknavigator.data

import com.google.gson.annotations.SerializedName

/**
 * 链接数据模型
 */
data class Link(
    @SerializedName("id")
    val id: String,
    
    @SerializedName("displayName")
    val displayName: String,
    
    @SerializedName("url")
    val url: String,
    
    @SerializedName("updatedAt")
    val updatedAt: String
)
