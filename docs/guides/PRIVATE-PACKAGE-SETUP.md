# Private Package Authentication Setup

## Overview

This project uses private npm packages under the `@gpp` scope, specifically `@gpp/pw-core@^1.0.0`. These packages are hosted on a private registry and require proper authentication for installation.

## Problem

The `@gpp/pw-core` package is not accessible from the public npm registry, causing build failures with errors like:
```
npm ERR! 404 Not Found - GET https://registry.npmjs.org/@gpp%2fpw-core
npm ERR! 404 '@gpp/pw-core@^1.0.0' is not in the npm registry.
```

## Solution

### 1. Registry Configuration

Each service requiring private packages has a `.npmrc` file that configures the npm client to use the private registry for `@gpp` scoped packages.

**Example `.npmrc` configuration:**
```ini
# Private registry for @gpp scope
@gpp:registry=https://npm.pkg.github.com/gpp/

# Authentication token for private registry
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}

# Always authenticate for @gpp scoped packages
@gpp:always-auth=true

# Registry configuration for default packages (public npm)
registry=https://registry.npmjs.org/
```

### 2. Authentication Methods

#### **Option A: GitHub Package Registry (Recommended)**

If using GitHub Package Registry:

1. **Create a Personal Access Token (PAT)**:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate a new token with `read:packages` scope
   - Copy the token value

2. **Set Environment Variable**:
   ```bash
   export NPM_TOKEN=your_github_token_here
   ```

3. **Alternative: Add to .bashrc/.zshrc**:
   ```bash
   echo 'export NPM_TOKEN=your_github_token_here' >> ~/.bashrc
   source ~/.bashrc
   ```

#### **Option B: NPM Registry**

If using npm.js private registry:

1. **Login to npm**:
   ```bash
   npm login --registry=https://registry.npmjs.org/
   ```

2. **Update .npmrc**:
   ```ini
   @gpp:registry=https://registry.npmjs.org/
   //registry.npmjs.org/:_authToken=${NPM_TOKEN}
   ```

#### **Option C: Corporate Registry (Nexus/Artifactory)**

If using internal corporate registry:

1. **Update .npmrc**:
   ```ini
   @gpp:registry=https://nexus.internal.gpp.com/repository/npm-private/
   //nexus.internal.gpp.com/repository/npm-private/:_authToken=${NPM_TOKEN}
   ```

2. **Get corporate token from your IT department**

### 3. Environment Variables

#### **Development**
```bash
# Required for private package access
export NPM_TOKEN=your_authentication_token

# Optional: Alternative registry URL
export NPM_REGISTRY_URL=https://npm.pkg.github.com/gpp/
```

#### **CI/CD (GitHub Actions)**
```yaml
env:
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Add `NPM_TOKEN` to your GitHub repository secrets.

#### **Docker Build**
```dockerfile
# Pass NPM_TOKEN as build argument
ARG NPM_TOKEN
RUN echo "//npm.pkg.github.com/:_authToken=${NPM_TOKEN}" >> ~/.npmrc
```

### 4. Verification

#### **Check Registry Configuration**
```bash
npm config get @gpp:registry
# Should output: https://npm.pkg.github.com/gpp/
```

#### **Test Package Installation**
```bash
npm view @gpp/pw-core
# Should show package information without 404 error
```

#### **Clean Install**
```bash
rm -rf node_modules package-lock.json
npm install
```

### 5. Services with Private Package Dependencies

The following services require private package authentication:

| Service | Private Dependencies | Location |
|---------|---------------------|----------|
| fast-enrichment-service | @gpp/pw-core@^1.0.0 | `fast-enrichment-service/.npmrc` |
| fast-requesthandler-service | @gpp/pw-core@^1.0.0 | `fast-requesthandler-service/.npmrc` |
| pw-core | (publishing target) | `pw-core/.npmrc` |

### 6. Troubleshooting

#### **Common Issues**

**1. 404 Not Found**
```
npm ERR! 404 '@gpp/pw-core@^1.0.0' is not in the npm registry.
```

**Solution**: Verify registry configuration and authentication token.

**2. 401 Unauthorized**
```
npm ERR! 401 Unauthorized - GET https://npm.pkg.github.com/@gpp%2fpw-core
```

**Solution**: Check if NPM_TOKEN is set correctly and has proper permissions.

**3. ENOTFOUND**
```
npm ERR! request to https://npm.pkg.github.com/gpp/ failed, reason: getaddrinfo ENOTFOUND
```

**Solution**: Check network connectivity and registry URL.

#### **Debug Commands**

```bash
# Check npm configuration
npm config list

# Check registry for @gpp scope
npm config get @gpp:registry

# Test authentication
npm whoami --registry=https://npm.pkg.github.com/gpp/

# Clear npm cache
npm cache clean --force

# Verbose install for debugging
npm install --verbose
```

### 7. Multi-Stage Docker Build Configuration

For Docker builds, ensure the `.npmrc` file is available during the dependency installation stage:

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copy package files AND .npmrc
COPY package*.json ./
COPY .npmrc ./

# Pass NPM_TOKEN as build argument
ARG NPM_TOKEN
ENV NPM_TOKEN=${NPM_TOKEN}

# Install dependencies
RUN npm ci --ignore-scripts && npm cache clean --force
```

### 8. Local Development with Workspaces

If developing locally with npm workspaces, the local version of `@gpp/pw-core` will be used automatically. The private registry configuration only applies when:

1. Installing from CI/CD
2. Fresh clone without local pw-core
3. Publishing the package

### 9. Best Practices

#### **Security**
- ✅ Use environment variables for tokens
- ✅ Never commit tokens to version control
- ✅ Use scoped authentication (only for @gpp packages)
- ✅ Regularly rotate authentication tokens

#### **Configuration**
- ✅ Use service-specific .npmrc files
- ✅ Document registry URLs and authentication methods
- ✅ Test private package access in CI/CD
- ✅ Provide fallback registry options

#### **Deployment**
- ✅ Verify package accessibility before deployment
- ✅ Use build-time authentication for Docker
- ✅ Monitor package registry availability
- ✅ Have backup authentication methods

### 10. Support

For issues with private package access:

1. **Check this documentation** for common solutions
2. **Verify environment variables** are set correctly
3. **Test registry connectivity** using debug commands
4. **Contact IT support** for corporate registry issues
5. **Check GitHub Package Registry status** if using GitHub

### 11. Alternative Solutions

If private registry access is unavailable:

#### **Option 1: Local File Installation**
```bash
# Install from local file
npm install file:../pw-core
```

#### **Option 2: Git Installation**
```json
{
  "dependencies": {
    "@gpp/pw-core": "git+https://github.com/gpp/pw-core.git#main"
  }
}
```

#### **Option 3: Workspace Link**
```bash
# In the service directory
npm link ../pw-core
```

---

## Quick Setup Checklist

- [ ] Set `NPM_TOKEN` environment variable
- [ ] Verify `.npmrc` file exists in service directory
- [ ] Test with `npm view @gpp/pw-core`
- [ ] Clean install with `npm install`
- [ ] Update CI/CD secrets if needed
- [ ] Document team authentication process

This setup ensures reliable access to private packages across all environments while maintaining security best practices. 