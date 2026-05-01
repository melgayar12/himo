# Himo online Deployment

## Render

1. Create a GitHub repository and upload this project.
2. Open Render and create a new Web Service.
3. Connect the GitHub repository.
4. Use these settings:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
5. Deploy the service.

Render will provide a public URL such as:

```text
https://your-service-name.onrender.com
```

## Important Production Notes

This version stores data in `db.json`. That is fine for a demo, but a production shop should use:

- PostgreSQL or another hosted database for users, products, orders, and chat.
- Cloudinary, S3, or another object storage service for uploaded product images.
- Strong password hashing such as bcrypt or argon2.
- HTTPS, environment variables, and private admin credentials.

Uploaded images are currently saved as database data URLs, which is simple for a demo but not ideal for large catalogs.
