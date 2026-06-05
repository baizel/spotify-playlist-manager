# Deploy to Production

Deploy the current branch to the production VPS.

## Steps

1. **Stage and commit** all modified and untracked files (excluding secrets like `config.json`).
   - Run `git status` to see what's changed
   - Stage relevant files with `git add`
   - Commit with a meaningful message following the repo's commit style
   - Skip if there's nothing to commit

2. **Push** to `origin main`:
   ```
   git push origin main
   ```

3. **SSH to VPS and deploy**:
   ```
   ssh -i /Users/baizel/.ssh/baizel.dev 'root@baizel.dev' "cd /var/www/spotify && git pull && systemctl restart mixe && systemctl status mixe --no-pager"
   ```

4. **Confirm** the service is `active (running)` from the status output.

## Notes
- Repo on VPS: `/var/www/spotify`
- Service: `mixe.service` (uWSGI serving the Flask app)
- SSH key: `/Users/baizel/.ssh/baizel.dev`
- Never commit `config.json` (contains secrets)
