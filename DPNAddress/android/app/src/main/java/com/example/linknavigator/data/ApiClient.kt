package com.example.linknavigator.data

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

/**
 * API客户端
 * 用于初始化Retrofit并提供API服务实例
 */
object ApiClient {
    
    // 实际的worker域名
    private var baseUrl = "https://v4.1970.qzz.io/"
    
    private var retrofit: Retrofit? = null
    
    val apiService: ApiService
        get() {
            if (retrofit == null) {
                retrofit = Retrofit.Builder()
                    .baseUrl(baseUrl)
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
            }
            return retrofit!!.create(ApiService::class.java)
        }
    
    /**
     * 初始化API客户端
     * @param url 基础URL
     */
    fun init(url: String) {
        baseUrl = url
        retrofit = null // 重置retrofit实例
    }
}
