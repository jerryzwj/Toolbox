package com.example.personalhome;

import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;
import android.widget.Toast;
import android.graphics.Color;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ProgressBar progressBar;
    private ProgressBar loadingAnimation;
    private ProgressBar saveAnimation;
    private static final String BASE_URL = "https://zy.1970.qzz.io/";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 创建主容器
        RelativeLayout rootLayout = new RelativeLayout(this);
        rootLayout.setLayoutParams(new RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.MATCH_PARENT,
                RelativeLayout.LayoutParams.MATCH_PARENT
        ));
        rootLayout.setBackgroundColor(Color.parseColor("#f5f5f5"));
        
        // 创建WebView
        webView = new WebView(this);
        RelativeLayout.LayoutParams webViewParams = new RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.MATCH_PARENT,
                RelativeLayout.LayoutParams.MATCH_PARENT
        );
        webView.setId(View.generateViewId());
        rootLayout.addView(webView, webViewParams);
        
        // 创建ProgressBar
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        RelativeLayout.LayoutParams progressParams = new RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.MATCH_PARENT,
                10
        );
        progressParams.addRule(RelativeLayout.ALIGN_PARENT_TOP);
        progressBar.setId(View.generateViewId());
        progressBar.setVisibility(View.GONE);
        progressBar.setProgressDrawable(getResources().getDrawable(android.R.drawable.progress_horizontal));
        rootLayout.addView(progressBar, progressParams);
        
        // 创建加载动画
        loadingAnimation = new ProgressBar(this, null, android.R.attr.progressBarStyleLarge);
        RelativeLayout.LayoutParams loadingParams = new RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.WRAP_CONTENT,
                RelativeLayout.LayoutParams.WRAP_CONTENT
        );
        loadingParams.addRule(RelativeLayout.CENTER_IN_PARENT);
        loadingAnimation.setId(View.generateViewId());
        loadingAnimation.setVisibility(View.VISIBLE);
        rootLayout.addView(loadingAnimation, loadingParams);
        
        // 创建保存动画
        saveAnimation = new ProgressBar(this, null, android.R.attr.progressBarStyleLarge);
        RelativeLayout.LayoutParams saveParams = new RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.WRAP_CONTENT,
                RelativeLayout.LayoutParams.WRAP_CONTENT
        );
        saveParams.addRule(RelativeLayout.CENTER_IN_PARENT);
        saveAnimation.setId(View.generateViewId());
        saveAnimation.setVisibility(View.GONE);
        saveAnimation.setIndeterminate(true);
        rootLayout.addView(saveAnimation, saveParams);
        
        // 设置为内容视图
        setContentView(rootLayout);

        // 初始化离线模式
        initOfflineMode();

        // 检查网络连接
        if (!isNetworkConnected()) {
            showErrorPage("网络连接不可用，请检查网络设置后重试");
        }

        // 配置 WebView
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setAllowContentAccess(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setSupportZoom(true);
        webSettings.setBuiltInZoomControls(true);
        webSettings.setDisplayZoomControls(false);
        webSettings.setUseWideViewPort(true);
        webSettings.setLoadWithOverviewMode(true);
        
        // 注册JavaScript接口
        webView.addJavascriptInterface(new WebAppInterface(this), "Android");

        // 启用混合内容（HTTP 和 HTTPS）
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        // 设置 WebViewClient
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri.toString().startsWith(BASE_URL)) {
                    // 内部链接，使用 WebView 加载
                    return false;
                } else {
                    // 外部链接，使用浏览器打开
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(intent);
                    return true;
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                loadingAnimation.setVisibility(View.GONE);
                showErrorPage("加载失败: " + description);
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                loadingAnimation.setVisibility(View.GONE);
                progressBar.setVisibility(View.GONE);
            }
        });

        // 设置 WebChromeClient
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                    loadingAnimation.setVisibility(View.GONE);
                }
            }

            @Override
            public void onReceivedTitle(WebView view, String title) {
                super.onReceivedTitle(view, title);
                setTitle(title);
            }
        });

        // 加载 URL
        webView.loadUrl(BASE_URL);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (webView != null) {
            webView.destroy();
        }
    }

    private boolean isNetworkConnected() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            NetworkCapabilities capabilities = cm.getNetworkCapabilities(cm.getActiveNetwork());
            return capabilities != null && (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || 
                                           capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                                           capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
        } else {
            NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        }
    }

    // 显示错误页面
    private void showErrorPage(String errorMessage) {
        String html = "<html><body style='background-color:#f5f5f5; font-family:sans-serif; padding:20px;'>" +
                "<div style='max-width:600px; margin:0 auto; background:white; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1);'>" +
                "<h2 style='color:#165DFF; text-align:center;'>连接错误</h2>" +
                "<p style='color:#666; text-align:center; margin:20px 0;'>" + errorMessage + "</p>" +
                "<div style='text-align:center;'>" +
                "<button onclick='window.location.reload()' style='background:#165DFF; color:white; border:none; padding:12px 24px; border-radius:5px; cursor:pointer; font-size:16px;'>" +
                "重试" +
                "</button>" +
                "</div>" +
                "<p style='color:#999; text-align:center; margin-top:30px; font-size:14px;'>" +
                "个人主页应用" +
                "</p>" +
                "</div>" +
                "</body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    // 初始化离线模式
    private void initOfflineMode() {
        WebSettings webSettings = webView.getSettings();
        // 启用缓存
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setAllowFileAccess(true);
    }
    
    // JavaScript接口，用于与WebView中的页面通信
    @SuppressLint("JavascriptInterface")
    private class WebAppInterface {
        Context mContext;
        
        WebAppInterface(Context c) {
            mContext = c;
        }
        
        // 显示保存动画
        @android.webkit.JavascriptInterface
        public void showSaveAnimation() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    saveAnimation.setVisibility(View.VISIBLE);
                }
            });
        }
        
        // 隐藏保存动画
        @android.webkit.JavascriptInterface
        public void hideSaveAnimation() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    saveAnimation.setVisibility(View.GONE);
                }
            });
        }
    }
}