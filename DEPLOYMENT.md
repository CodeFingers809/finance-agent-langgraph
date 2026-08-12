# Deployment Guide

This document outlines the exact step-by-step procedure to build and deploy the Finance Agent application to an EC2 instance.

---

## Prerequisites

1. Access to the EC2 server via SSH (e.g., `ssh ec2-user@<YOUR_EC2_HOST>` or `ssh ec2-hobby`).
2. Docker installed and running on the EC2 host.
3. An existing `.env` file located at `~/finance-agent/.env` on the EC2 host containing all production secrets and environment variables.

---

## Deployment Steps

### 1. SSH into the EC2 Instance & Update Repository

Navigate to the project directory on your EC2 instance and pull the latest changes from `main`:

```bash
ssh <EC2_HOST> "cd ~/finance-agent && git pull origin main"
```

### 2. Build the Docker Container

Extract required build-time variables (such as `VITE_CLERK_PUBLISHABLE_KEY`) from your server's `.env` file and build the Docker image:

```bash
ssh <EC2_HOST> "cd ~/finance-agent && \
  VITE_KEY=\$(grep VITE_CLERK_PUBLISHABLE_KEY .env | cut -d '=' -f2) && \
  docker build --build-arg VITE_CLERK_PUBLISHABLE_KEY=\$VITE_KEY -t finance-agent -f backend/Dockerfile ."
```

*Note: The container uses a multi-stage Docker build that compiles the frontend assets and packages the Python FastAPI/Granian multi-worker backend along with container-local Redis caching.*

### 3. Run / Restart the Docker Container

Stop and remove any running instance of the container, then start a new container referencing your server's `.env` file:

```bash
ssh <EC2_HOST> "docker rm -f finance-agent-app || true && \
  docker run -d \
    --name finance-agent-app \
    --restart always \
    -p 8000:8000 \
    --env-file ~/finance-agent/.env \
    finance-agent"
```

---

## Verification & Health Check

After launching the container, verify that the backend workers are healthy by executing a GET request against the health-check route:

```bash
curl -k https://<YOUR_DOMAIN>/api/v1/utils/health-check/
```

Expected output:
```
true
```
