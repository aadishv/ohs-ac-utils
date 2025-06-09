import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Badge,
  Button,
  ButtonGroup,
  Content,
  defaultTheme,
  Flex,
  Form,
  Heading,
  Icon,
  InlineAlert,
  Provider,
  TextField,
} from "@adobe/react-spectrum";
import { GoogleGenAI } from "@google/genai";
import { createStore } from "@xstate/store";
import { useSelector } from "@xstate/store/react";

async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    await ai.models.generateContent({
      model: "models/gemma-3n-e4b-it",
      contents: "Return with the shortest possible response: \".\".",
    });
    return true;
  } catch {
    return false;
  }
}

const store = createStore({
  context: {
    ai: null as GoogleGenAI | null,
  },
  on: {
    set_api_key: (context, event: { key: string }) => {
      context.ai = new GoogleGenAI({ apiKey: event.key });
    },
  }
});

function Checkmark(props: any) {
  return (
    <Icon {...props}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 16 16"
      >
        {" "}
        <g id="CheckmarkSize400">
          {" "}
          <rect id="Frame" width="16" height="16" fill="red" opacity="0" />{" "}
          <path d="M14.57422,1.897a1.13073,1.13073,0,0,0-1.58692.19092L5.83844,11.18622l-2.8526-3.424a1.13057,1.13057,0,1,0-1.7373,1.44726l3.74658,4.49707c.02307.02771.05694.03784.082.06281a1.06414,1.06414,0,0,0,.08838.1037,1.08237,1.08237,0,0,0,.16113.0874,1.08606,1.08606,0,0,0,.11053.05994,1.12408,1.12408,0,0,0,.4256.09387l.01367-.003a1.12318,1.12318,0,0,0,.42194-.09485,1.09553,1.09553,0,0,0,.12885-.07349,1.08733,1.08733,0,0,0,.16015-.09131,1.05774,1.05774,0,0,0,.08313-.10345c.025-.02619.05957-.03693.0824-.066L14.76465,3.48438A1.13031,1.13031,0,0,0,14.57422,1.897Z" />{" "}
        </g>{" "}
      </svg>
    </Icon>
  );
}

function KeyInputView() {
  const [errors, setErrors] = useState({});
  
  const onSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const apiKey = data.apiKey as string;
    
    const isValid = await validateApiKey(apiKey);
    
    if (isValid) {
      setErrors({});
      setTimeout(() => { store.trigger.set_api_key({ key: apiKey }); }, 1000);
    } else {
      setErrors({ apiKey: 'Invalid API key. Please check your key and try again.' });
    }
  }, []);
  
  return (
    <InlineAlert variant="negative">
      <Heading>No API key provided</Heading>
      <Content>
        In order to use AI features, please provide a Gemini API key. You can go
        to <a href="https://aistudio.google.com">Google AI Studio</a> to create
        an API key.
        <Form 
          validationBehavior="native" 
          maxWidth="size-3000"
          onSubmit={onSubmit}
          validationErrors={errors}
        >
          <TextField label="API Key" name="apiKey" isRequired />
          <ButtonGroup>
            <Button type="submit" variant="primary">Submit</Button>
            <Button type="reset" variant="secondary">Reset</Button>
          </ButtonGroup>
        </Form>
      </Content>
    </InlineAlert>
  );
}

function App() {
  const ai = useSelector(store, (state) => state.context.ai);
  return ai ? <div>"YOU HAVE AN API KEY YASSS</div> : <KeyInputView />;
}

// Mount directly if #root exists (for direct import from index.html)
const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <Provider theme={defaultTheme}>
      <div style={{ padding: "1rem", height: "100vh" }}>
        <App />
      </div>
    </Provider>,
  );
}
