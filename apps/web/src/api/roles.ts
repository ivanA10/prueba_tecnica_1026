import { api } from './api';
import type { Role } from './types';

export interface RoleBody {
  name: string;
  description?: string;
  permissions: string[];
  version?: number;
}

export const rolesApi = api.injectEndpoints({
  endpoints: (b) => ({
    getRoles: b.query<Role[], void>({ query: () => '/roles', providesTags: ['Role'] }),
    createRole: b.mutation<Role, RoleBody>({
      query: (body) => ({ url: '/roles', method: 'POST', body }),
      invalidatesTags: ['Role'],
    }),
    updateRole: b.mutation<Role, RoleBody & { id: string }>({
      query: ({ id, ...body }) => ({ url: `/roles/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Role'],
    }),
  }),
});
export const { useGetRolesQuery, useCreateRoleMutation, useUpdateRoleMutation } = rolesApi;
