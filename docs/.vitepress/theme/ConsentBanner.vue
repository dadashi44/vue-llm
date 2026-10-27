<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { consentRequired, getConsent, setConsent, type Consent } from './analytics'
import { useStrings } from './strings'

const strings = useStrings()
const visible = ref(false)

onMounted(() => {
  visible.value = consentRequired && location.hostname === 'dadashi44.github.io' && getConsent() === null
})

function choose(consent: Consent): void {
  setConsent(consent)
  visible.value = false
}
</script>

<template>
  <div v-if="visible" class="consent" role="region" aria-label="Analytics consent">
    <p>{{ strings.consent }}</p>
    <div class="buttons">
      <button type="button" class="decline" @click="choose('denied')">
        {{ strings.decline }}
      </button>
      <button type="button" class="accept" @click="choose('granted')">
        {{ strings.accept }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.consent {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 100;
  max-width: 380px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-3);
  font-size: 13px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

p {
  margin: 0;
}

.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

button {
  padding: 5px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.decline {
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
}

.accept {
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
}

@media (max-width: 480px) {
  .consent {
    right: 16px;
    max-width: none;
  }
}
</style>
