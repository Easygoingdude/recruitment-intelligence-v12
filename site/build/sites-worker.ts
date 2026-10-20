import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { handleMcpRequest } from "../lib/mcp-server";
import { handleAIRequest } from "../lib/recruitment-ai";
import { handleAssessmentAI } from "../lib/assessment-ai";
import { handleInterviews } from '../lib/interview-store';
import { handleApplications } from '../lib/application-store';
import { handleJobs } from '../lib/job-store';
import { handleAppointments } from '../lib/appointment-store';

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const url = new URL(request.url);
    if (url.pathname === '/api/applications') return handleApplications(request,env);
    if (url.pathname === '/api/appointments') return handleAppointments(request,env);
    if (url.pathname === '/api/jobs') return handleJobs(request,env);
    if (url.pathname === '/api/interviews' || url.pathname === '/api/interviews/cleanup') return handleInterviews(request,env);
    if (url.pathname === '/api/assessment-ai') return handleAssessmentAI(request,env);
    if (url.pathname === "/api/ai" || url.pathname === "/api/ai/status") {
      return handleAIRequest(request, env);
    }
    if (url.pathname === "/mcp") {
      return handleMcpRequest(request, env);
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};
