package com.example.linknavigator.adapter

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.linknavigator.R
import com.example.linknavigator.data.Link

/**
 * 链接列表适配器
 */
class LinkAdapter(
    private val context: Context,
    private val links: List<Link>,
    private val onDeleteClick: (Link) -> Unit
) : RecyclerView.Adapter<LinkAdapter.LinkViewHolder>() {
    
    inner class LinkViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val tvName: TextView? = itemView.findViewById(R.id.tvName)
        val tvUrl: TextView? = itemView.findViewById(R.id.tvUrl)
        val tvTime: TextView? = itemView.findViewById(R.id.tvTime)
        val btnDelete: ImageButton? = itemView.findViewById(R.id.btnDelete)
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): LinkViewHolder {
        try {
            val view = LayoutInflater.from(context).inflate(R.layout.item_link, parent, false)
            return LinkViewHolder(view)
        } catch (e: Exception) {
            e.printStackTrace()
            // 返回一个空的ViewHolder，避免崩溃
            return LinkViewHolder(View(context))
        }
    }
    
    override fun getItemCount(): Int {
        return links.size
    }
    
    override fun onBindViewHolder(holder: LinkViewHolder, position: Int) {
        try {
            val link = links[position]
            
            holder.tvName?.text = link.displayName
            holder.tvUrl?.text = link.url
            holder.tvTime?.text = link.updatedAt
            
            // 点击链接名称或URL跳转到目标地址
            holder.tvName?.setOnClickListener {
                openUrl(link.url)
            }
            
            holder.tvUrl?.setOnClickListener {
                openUrl(link.url)
            }
            
            // 点击删除按钮
            holder.btnDelete?.setOnClickListener {
                onDeleteClick(link)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
    
    /**
     * 打开URL
     */
    private fun openUrl(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            context.startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
