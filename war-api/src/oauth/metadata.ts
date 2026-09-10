import { mcpResourceIdentifier } from './resource.js';

/**
 * RFC 8414 Authorization Server Metadata (spec §4.3.5).
 *
 * Hand-written rather than built from the MCP SDK's `createOAuthMetadata`
 * helper: that helper hardcodes `authorization_endpoint`/`token_endpoint` as
 * root-relative paths (`/authorize`, `/token`) resolved against a `baseUrl`,
 * and a leading `/` in a relative URL reference always replaces the base's
 * entire path per the WHATWG URL spec — so no `baseUrl` value can place them
 * under this deployment's `/api/v1/oauth/*` prefix. The endpoints this
 * document names are still served by the SDK's own `authorizationHandler`/
 * `tokenHandler` request logic (`src/oauth/routes.ts`); only the ~10-field
 * static document is hand-assembled, not the protocol behaviour.
 *
 * `registration_endpoint` is omitted: Dynamic Client Registration
 * (`POST /oauth/register`) is slice 3 (§15's build order), and advertising
 * an endpoint that does not exist would be actively wrong.
 */
export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  client_id_metadata_document_supported: boolean;
}

export function authorizationServerMetadata(apiBaseUrl: string): AuthorizationServerMetadata {
  return {
    issuer: apiBaseUrl,
    authorization_endpoint: `${apiBaseUrl}/api/v1/oauth/authorize`,
    token_endpoint: `${apiBaseUrl}/api/v1/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
  };
}

/**
 * RFC 9728 Protected Resource Metadata (spec §4.3.5): names this deployment's
 * one resource and points at this API's own issuer as its authorization
 * server — trivial since this API plays both roles (§4.3.6).
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
}

export function protectedResourceMetadata(apiBaseUrl: string): ProtectedResourceMetadata {
  return {
    resource: mcpResourceIdentifier(apiBaseUrl),
    authorization_servers: [apiBaseUrl],
  };
}
