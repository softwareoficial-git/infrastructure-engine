import axios, { AxiosInstance } from "axios";

export interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

class InfraClient {
  private httpClient: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.DB_URL || "http://localhost:3001";
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DB_TOKEN || ""}`,
      },
    });
  }

  public async execute<T = any>(
    cmd: string,
    payload: any,
    token: string,
  ): Promise<ServiceResponse<T>> {
    try {
      const requestBody: any = {
        command: cmd,
        payload: payload,
      };

      if (token) {
        requestBody.token = token;
      }

      const response = await this.httpClient.post("/execute", requestBody);

      const result = response.data;
      //...
      console.log(
        `[INFRA_RESPONSE] CMD: ${cmd} | STATUS: ${result.status} | DATA:`,
        JSON.stringify(result.data, null, 2),
      );

      if (result.status === "success") {
        const finalData =
          result.data &&
          typeof result.data === "object" &&
          "value" in result.data
            ? result.data.value
            : result.data;

        return {
          success: true,
          message: result.message || "Operation successful",
          data: finalData,
        };
      } else {
        return {
          success: false,
          message:
            result.error?.message ||
            "La infraestructura devolvió un error en la ejecución del comando.",
          error: {
            code: result.error?.code || "INFRA_EXECUTION_ERROR",
            message:
              result.error?.message ||
              "Se produjo un error interno en el motor de infraestructura al procesar la solicitud.",
            details: result.error?.details,
          },
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message:
          error.response?.data?.error?.message ||
          error.message ||
          "No se pudo establecer conexión con el servidor de infraestructura.",
        error: {
          code: error.response?.data?.error?.code || "INFRA_CONNECTION_ERROR",
          message: error.message,
        },
      };
    }
  }

  public async readPath<T = any>(
    clienteId: string | number,
    path: string,
    token: string,
  ): Promise<ServiceResponse<T>> {
    return this.execute<T>("USER:read-path", { clienteId, path }, token);
  }

  public async updatePath(
    clienteId: string | number,
    path: string,
    value: any,
    token: string,
  ): Promise<ServiceResponse> {
    return this.execute("USER:update-path", { clienteId, path, value }, token);
  }

  public async pushItem(
    clienteId: string | number,
    path: string,
    item: any,
    token: string,
  ): Promise<ServiceResponse> {
    return this.execute("USER:push-item", { clienteId, path, item }, token);
  }

  public async batch(
    commands: { cmd: string; payload: any }[],
    token: string,
  ): Promise<ServiceResponse> {
    return this.execute("SYSTEM:batch", { commands }, token);
  }

  public async queryJson<T = any>(
    clienteId: string | number,
    path: string,
    filter: any,
    token: string,
  ): Promise<ServiceResponse<T[]>> {
    return this.execute<T[]>(
      "USER:query-json",
      { clienteId, path, filter },
      token,
    );
  }
}

export const infraClient = new InfraClient();
