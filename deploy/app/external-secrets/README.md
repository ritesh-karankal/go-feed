# Production Setup: External Secrets Operator (ESO) + HashiCorp Vault / AWS Secrets Manager

## 1. Install External Secrets Operator via Helm

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

helm upgrade --install external-secrets external-secrets/external-secrets \
  -n external-secrets \
  --create-namespace \
  --set installCRDs=true
```

## 2. Configure Authentication

### Option A: HashiCorp Vault (Kubernetes Auth Engine)
1. Enable Kubernetes Auth in Vault:
   ```bash
   vault auth enable kubernetes
   ```
2. Configure Vault with EKS JWT validation endpoint.
3. Create a Vault policy allowing read access to `secret/data/go-feed/*`.
4. Apply the ClusterSecretStore:
   ```bash
   kubectl apply -f deploy/app/external-secrets/cluster-secret-store-vault.yaml
   ```

### Option B: AWS Secrets Manager (EKS IRSA / Pod Identity)
1. Attach `SecretsManagerReadWrite` IAM policy to your EKS Service Account `external-secrets`.
2. Apply the ClusterSecretStore:
   ```bash
   kubectl apply -f deploy/app/external-secrets/cluster-secret-store-aws.yaml
   ```

## 3. Apply ExternalSecret Resource

```bash
kubectl apply -f deploy/app/external-secrets/external-secret.yaml
```

## 4. Verify Secret Synchronization

```bash
# Check ExternalSecret sync status
kubectl get externalsecret go-feed-secrets -n default

# Check generated Kubernetes Secret
kubectl get secret go-feed-secrets -n default
```
