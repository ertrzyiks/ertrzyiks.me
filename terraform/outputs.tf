output "blog_app_name" {
  description = "The name of the blog app"
  value       = dokku_app.blog.app_name
}

output "home_app_name" {
  description = "The name of the home app"
  value       = dokku_app.home.app_name
}
