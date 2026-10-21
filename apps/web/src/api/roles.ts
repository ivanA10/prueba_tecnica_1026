import { api } from './api';
import type { Role } from './types';

export const rolesApi = api.injectEndpoints({
  endpoints: (b) => ({
    getRoles: b.query<Role[], void>({ query: () => '/roles', providesTags: ['Role'] }),
  }),
});
export const { useGetRolesQuery } = rolesApi;
