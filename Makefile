.PHONY: help start debug stop logs ps

help: ## Show available commands
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36mmake %-20s\033[0m %s\n", $$1, $$2}'

start: ## Start MongoDB backend stack (Redis + DEFRA ID stub + LocalStack + MongoDB + Backend)
	docker compose --profile mongo up redis defra-id-stub localstack mongodb trade-demo-backend -d
	@echo "MongoDB backend stack started:"
	@echo "  - Backend: http://localhost:8085"
	@echo "  - DEFRA ID stub: http://localhost:3200"
	@echo "  - Redis: localhost:6379"
	@echo "Starting frontend with hot reload..."
	@echo "Logs: tail -f frontend.log"
	export $$(grep -v '^#' .env | grep -v '^$$' | xargs) && npm run dev 2>&1 | tee frontend.log

debug: ## Start MongoDB backend stack in debug mode (debugger pauses on startup)
	docker compose --profile mongo up redis defra-id-stub localstack mongodb trade-demo-backend -d
	@echo "MongoDB backend stack started:"
	@echo "  - Backend: http://localhost:8085"
	@echo "  - DEFRA ID stub: http://localhost:3200"
	@echo "  - Redis: localhost:6379"
	@echo ""
	@echo "Starting frontend in DEBUG mode..."
	@echo "Debugger listening on 0.0.0.0:9229"
	@echo "Attach your debugger to chrome://inspect or your IDE"
	@echo ""
	export $$(grep -v '^#' .env | grep -v '^$$' | xargs) && npm run dev:debug

test: ## Run tests
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

register-user: ## Register a test user with DEFRA ID stub (required before first login)
	@./scripts/register-test-user.sh

stop: ## Stop all services and remove volumes
	@echo "Stopping Docker services..."
	@docker compose --profile mongo --profile postgres down -v
	@echo "Killing any remaining npm/node processes on port 3000..."
	@lsof -ti :3000 | xargs kill -9 2>/dev/null || true
	@pkill -f "npm run dev" 2>/dev/null || true
	@pkill -f "nodemon.*src" 2>/dev/null || true
	@echo "All services stopped."

logs: ## Show logs from all running services
	docker compose logs -f

ps: ## Show status of all services
	docker compose ps
