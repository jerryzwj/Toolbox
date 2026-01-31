package com.example.linknavigator.data

import retrofit2.Call
import retrofit2.http.GET
import retrofit2.http.DELETE
import retrofit2.http.Query

/**
 * API服务接口
 */
interface ApiService {
    
    /**
     * 获取所有链接
     */
    @GET("api/links")
    fun getLinks(): Call<ApiResponse>
    
    /**
     * 删除链接
     */
    @DELETE("api/links")
    fun deleteLink(@Query("delete") id: String): Call<ApiResponse>
}
