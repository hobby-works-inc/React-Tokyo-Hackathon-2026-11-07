// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages, GetConfigResponse, SearchCodecsForPages } from 'waku/router';

// prettier-ignore
import type { getConfig as File_Cart_getConfig } from './pages/cart';
// prettier-ignore
import type { getConfig as File_Index_getConfig } from './pages/index';
// prettier-ignore
import type { getConfig as File_Login_getConfig } from './pages/login';
// prettier-ignore
import type { getConfig as File_OrderComplete_getConfig } from './pages/order-complete';
// prettier-ignore
import type { getConfig as File_ProductsId_getConfig } from './pages/products/[id]';
// prettier-ignore
import type { getConfig as File_Result_getConfig } from './pages/result';
// prettier-ignore
import type { getConfig as File_Signup_getConfig } from './pages/signup';

// prettier-ignore
type Page =
| ({ path: '/cart' } & GetConfigResponse<typeof File_Cart_getConfig>)
| ({ path: '/' } & GetConfigResponse<typeof File_Index_getConfig>)
| ({ path: '/login' } & GetConfigResponse<typeof File_Login_getConfig>)
| ({ path: '/order-complete' } & GetConfigResponse<typeof File_OrderComplete_getConfig>)
| ({ path: '/products/[id]' } & GetConfigResponse<typeof File_ProductsId_getConfig>)
| ({ path: '/result' } & GetConfigResponse<typeof File_Result_getConfig>)
| ({ path: '/signup' } & GetConfigResponse<typeof File_Signup_getConfig>);

// prettier-ignore
type Layout =
| { path: '/' };

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>;
  }
  interface CreatePagesConfig {
    pages: Page;
    layouts: Layout;
  }
  interface SearchCodecsConfig extends SearchCodecsForPages<Page> {}
}
