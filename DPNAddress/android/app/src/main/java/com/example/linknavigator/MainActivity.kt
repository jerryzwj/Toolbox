package com.example.linknavigator

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.linknavigator.adapter.LinkAdapter
import com.example.linknavigator.data.ApiClient
import com.example.linknavigator.data.Link

class MainActivity : AppCompatActivity() {
    
    private var rvLinks: RecyclerView? = null
    private var btnRefresh: Button? = null
    private var btnSettings: ImageButton? = null
    private var progressBar: ProgressBar? = null
    private var tvEmpty: TextView? = null
    
    private val links = mutableListOf<Link>()
    private var adapter: LinkAdapter? = null
    
    // SharedPreferences名称
    private val PREFS_NAME = "app_settings"
    private val KEY_BASE_URL = "base_url"
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        // 隐藏状态栏和导航栏，实现全屏模式
        hideSystemUI()
        
        // 初始化UI组件
        initViews()
        
        // 刷新按钮点击事件
        btnRefresh?.setOnClickListener {
            loadLinks()
        }
        
        // 设置按钮点击事件
        btnSettings?.setOnClickListener {
            showSettingsDialog()
        }
        
        // 延迟初始化和加载，减少启动时的系统负担
        android.os.Handler().postDelayed({
            try {
                // 初始化RecyclerView
                setupRecyclerView()
                
                // 加载保存的域名设置
                val savedBaseUrl = getSavedBaseUrl()
                if (savedBaseUrl != null) {
                    ApiClient.init(savedBaseUrl)
                }
                
                // 加载数据
                loadLinks()
            } catch (e: Exception) {
                e.printStackTrace()
                // 忽略错误
                progressBar?.visibility = View.GONE
                tvEmpty?.visibility = View.VISIBLE
            }
        }, 1000) // 延迟1秒，让系统有充分时间完成启动流程
    }
    
    /**
     * 初始化UI组件
     */
    private fun initViews() {
        try {
            rvLinks = findViewById(R.id.rvLinks)
            btnRefresh = findViewById(R.id.btnRefresh)
            btnSettings = findViewById(R.id.btnSettings)
            progressBar = findViewById(R.id.progressBar)
            tvEmpty = findViewById(R.id.tvEmpty)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
    
    /**
     * 设置RecyclerView
     */
    private fun setupRecyclerView() {
        try {
            val safeContext = this
            adapter = LinkAdapter(safeContext, links) {
                // 显示删除确认对话框
                showDeleteConfirm(it)
            }
            rvLinks?.layoutManager = LinearLayoutManager(safeContext)
            rvLinks?.adapter = adapter
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
    
    /**
     * 显示删除确认对话框
     */
    private fun showDeleteConfirm(link: Link) {
        try {
            AlertDialog.Builder(this)
                .setTitle(getString(R.string.delete_confirm, link.displayName))
                .setPositiveButton(getString(R.string.refresh)) { _, _ ->
                    deleteLink(link)
                }
                .setNegativeButton("取消", null)
                .show()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
    
    /**
     * 删除链接
     */
    private fun deleteLink(link: Link) {
        try {
            val call = ApiClient.apiService.deleteLink(link.id)
            call.enqueue(object : retrofit2.Callback<com.example.linknavigator.data.ApiResponse> {
                override fun onResponse(
                    call: retrofit2.Call<com.example.linknavigator.data.ApiResponse>,
                    response: retrofit2.Response<com.example.linknavigator.data.ApiResponse>
                ) {
                    if (response.isSuccessful) {
                        Toast.makeText(this@MainActivity, getString(R.string.delete_success), Toast.LENGTH_SHORT).show()
                        loadLinks() // 重新加载数据
                    } else {
                        Toast.makeText(this@MainActivity, getString(R.string.delete_failed), Toast.LENGTH_SHORT).show()
                    }
                }
                
                override fun onFailure(
                    call: retrofit2.Call<com.example.linknavigator.data.ApiResponse>,
                    t: Throwable
                ) {
                    Toast.makeText(this@MainActivity, getString(R.string.delete_failed), Toast.LENGTH_SHORT).show()
                    t.printStackTrace()
                }
            })
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, getString(R.string.delete_failed), Toast.LENGTH_SHORT).show()
        }
    }
    
    /**
     * 加载链接数据
     */
    private fun loadLinks() {
        // 确保UI组件已经初始化
        if (progressBar == null || rvLinks == null || tvEmpty == null) {
            return
        }
        
        progressBar?.visibility = View.VISIBLE
        rvLinks?.visibility = View.GONE
        tvEmpty?.visibility = View.GONE
        
        try {
            val call = ApiClient.apiService.getLinks()
            call.enqueue(object : retrofit2.Callback<com.example.linknavigator.data.ApiResponse> {
                override fun onResponse(
                    call: retrofit2.Call<com.example.linknavigator.data.ApiResponse>,
                    response: retrofit2.Response<com.example.linknavigator.data.ApiResponse>
                ) {
                    progressBar?.visibility = View.GONE
                    
                    if (response.isSuccessful) {
                        val apiResponse = response.body()
                        if (apiResponse?.success == true && apiResponse.links != null) {
                            links.clear()
                            links.addAll(apiResponse.links)
                            adapter?.notifyDataSetChanged()
                            
                            if (links.isEmpty()) {
                                tvEmpty?.visibility = View.VISIBLE
                                rvLinks?.visibility = View.GONE
                            } else {
                                rvLinks?.visibility = View.VISIBLE
                                tvEmpty?.visibility = View.GONE
                            }
                        } else {
                            showError(getString(R.string.load_failed))
                        }
                    } else {
                        showError(getString(R.string.load_failed))
                    }
                }
                
                override fun onFailure(
                    call: retrofit2.Call<com.example.linknavigator.data.ApiResponse>,
                    t: Throwable
                ) {
                    progressBar?.visibility = View.GONE
                    showError(getString(R.string.load_failed))
                    t.printStackTrace()
                }
            })
        } catch (e: Exception) {
            e.printStackTrace()
            progressBar?.visibility = View.GONE
            showError(getString(R.string.load_failed))
        }
    }
    
    /**
     * 显示错误信息
     */
    private fun showError(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        tvEmpty?.visibility = View.VISIBLE
        rvLinks?.visibility = View.GONE
    }
    
    /**
     * 显示设置对话框
     */
    private fun showSettingsDialog() {
        try {
            val currentBaseUrl = getSavedBaseUrl() ?: "https://v4.1970.qzz.io/"
            
            val dialogView = layoutInflater.inflate(R.layout.dialog_settings, null)
            val editTextBaseUrl = dialogView.findViewById<EditText>(R.id.editTextBaseUrl)
            editTextBaseUrl.setText(currentBaseUrl)
            
            AlertDialog.Builder(this)
                .setTitle("设置")
                .setView(dialogView)
                .setPositiveButton("保存") { dialog, _ ->
                    val newBaseUrl = editTextBaseUrl.text.toString().trim()
                    if (newBaseUrl.isNotEmpty()) {
                        saveBaseUrl(newBaseUrl)
                        Toast.makeText(this, "设置已保存", Toast.LENGTH_SHORT).show()
                        // 重新初始化ApiClient
                        ApiClient.init(newBaseUrl)
                        // 重新加载链接
                        loadLinks()
                    } else {
                        Toast.makeText(this, "请输入有效的域名", Toast.LENGTH_SHORT).show()
                    }
                    dialog.dismiss()
                }
                .setNegativeButton("取消") { dialog, _ ->
                    dialog.dismiss()
                }
                .show()
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "显示设置失败", Toast.LENGTH_SHORT).show()
        }
    }
    
    /**
     * 保存域名设置
     */
    private fun saveBaseUrl(baseUrl: String) {
        try {
            val sharedPreferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            val editor = sharedPreferences.edit()
            editor.putString(KEY_BASE_URL, baseUrl)
            editor.apply()
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "保存设置失败", Toast.LENGTH_SHORT).show()
        }
    }
    
    /**
     * 获取保存的域名设置
     */
    private fun getSavedBaseUrl(): String? {
        try {
            val sharedPreferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            return sharedPreferences.getString(KEY_BASE_URL, null)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }
    
    /**
     * 隐藏系统UI，实现全屏模式
     */
    private fun hideSystemUI() {
        try {
            // 隐藏状态栏和导航栏
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
            
            // 使状态栏透明
            window.statusBarColor = android.graphics.Color.TRANSPARENT
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
    
    /**
     * 当窗口焦点变化时，重新隐藏系统UI
     */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUI()
        }
    }
}
